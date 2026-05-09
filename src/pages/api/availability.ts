import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';
import { format, startOfDay, addHours } from 'date-fns';

export const GET: APIRoute = async ({ request, url }) => {
  const courtId = url.searchParams.get('courtId');
  const dateStr = url.searchParams.get('date');

  if (!courtId || !dateStr) {
    return new Response(JSON.stringify({ error: 'Missing parameters' }), { status: 400 });
  }

  // 1. Fetch Court Data
  const { data: court } = await supabase
    .from('courts')
    .select('*')
    .eq('id', courtId)
    .single();

  if (!court) {
    return new Response(JSON.stringify({ error: 'Court not found' }), { status: 404 });
  }

  // 2. Fetch Blackouts for this date
  const { data: blackouts } = await supabase
    .from('blackouts')
    .select('*')
    .eq('court_id', courtId)
    .eq('date', dateStr);

  const activeBlackout = blackouts && blackouts.length > 0 ? blackouts[0] : null;

  // 3. Fetch Bookings for this date
  const startOfSelected = startOfDay(new Date(dateStr));
  const endOfSelected = addHours(startOfSelected, 24);

  const { data: bookings } = await supabase
    .from('bookings')
    .select('start_time, manual_slot_id, is_open_play, player_count')
    .eq('court_id', courtId)
    .neq('status', 'cancelled')
    .gte('start_time', startOfSelected.toISOString())
    .lt('start_time', endOfSelected.toISOString());

  // 4. Generate Slots
  let slots = [];
  
  const isTimeBlackedOut = (timeStr: string) => {
    if (!activeBlackout) return false;
    if (activeBlackout.all_day) return true;
    const slotTime = timeStr.split('T')[1]?.slice(0, 5);
    return slotTime >= activeBlackout.start_time && slotTime < activeBlackout.end_time;
  };

  if (court.manual_slots && Array.isArray(court.manual_slots)) {
    slots = court.manual_slots.map((slot: any) => {
      const slotId = typeof slot === 'string' ? slot : `${slot.start} - ${slot.end}`;
      const startTimeStr = typeof slot === 'string' ? slot.split(' - ')[0] : slot.start;
      const slotBookings = bookings?.filter(b => b.manual_slot_id === slotId) || [];
      
      const isExclusivelyBooked = slotBookings.some(b => !b.is_open_play);
      const totalPlayers = slotBookings.reduce((sum, b) => sum + (b.player_count || 1), 0);
      const hasOpenPlay = slotBookings.some(b => b.is_open_play);
      
      const maxPlayers = court.max_players || 4;
      const isBlackedOut = !!activeBlackout;

      // Price calculation based on rules
      let exclusive_price = court.base_price;
      const open_price = court.base_open_price || court.base_price;
      
      const slotStartTime = convertTo24h(startTimeStr);
      if (court.pricing_rules) {
        const rule = court.pricing_rules.find((r: any) => {
          const start = r.start;
          let end = r.end;
          if (end === '00:00') end = '24:00';
          return slotStartTime >= start && slotStartTime < end;
        });
        if (rule && rule.price !== null) {
          exclusive_price = rule.price;
        }
      }

      return {
        id: slotId,
        display: slotId,
        exclusivePrice: exclusive_price,
        openPrice: open_price,
        isBooked: isExclusivelyBooked || isBlackedOut || (hasOpenPlay && totalPlayers >= maxPlayers),
        allowExclusive: !hasOpenPlay && !isExclusivelyBooked && !isBlackedOut,
        allowOpen: !isExclusivelyBooked && !isBlackedOut && (totalPlayers < maxPlayers),
        remainingCapacity: isExclusivelyBooked ? 0 : Math.max(0, maxPlayers - totalPlayers),
        currentPlayers: totalPlayers
      };
    });
  } else {
    // Fallback to auto-slots
    for (let h = court.start_hour; h < court.end_hour; h++) {
      const time = addHours(startOfSelected, h);
      const slotTimeStr = time.toISOString();
      const slotBookings = bookings?.filter(b => new Date(b.start_time).getHours() === h) || [];
      
      const isExclusivelyBooked = slotBookings.some(b => !b.is_open_play);
      const totalPlayers = slotBookings.reduce((sum, b) => sum + (b.player_count || 1), 0);
      const hasOpenPlay = slotBookings.some(b => b.is_open_play);
      
      const isBlackedOut = !!activeBlackout;

      // Price calculation based on rules
      let exclusive_price = court.base_price;
      const open_price = court.base_open_price || court.base_price;
      const HHmm = format(time, 'HH:mm');
      if (court.pricing_rules) {
        const rule = court.pricing_rules.find((r: any) => {
          const start = r.start;
          let end = r.end;
          if (end === '00:00') end = '24:00';
          return HHmm >= start && HHmm < end;
        });
        if (rule && rule.price !== null) {
          exclusive_price = rule.price;
        }
      }

      slots.push({
        id: slotTimeStr,
        display: format(time, 'h:mm a') + ' - ' + format(addHours(time, 1), 'h:mm a'),
        exclusivePrice: exclusive_price,
        openPrice: open_price,
        isBooked: isExclusivelyBooked || isBlackedOut || (hasOpenPlay && totalPlayers >= court.max_players),
        allowExclusive: !hasOpenPlay && !isExclusivelyBooked && !isBlackedOut,
        allowOpen: !isExclusivelyBooked && !isBlackedOut && (totalPlayers < court.max_players),
        remainingCapacity: isExclusivelyBooked ? 0 : Math.max(0, court.max_players - totalPlayers),
        currentPlayers: totalPlayers
      });
    }
  }

  return new Response(JSON.stringify({ 
    slots,
    blackout: activeBlackout ? {
      reason: activeBlackout.reason || 'Closed for maintenance/holiday',
      all_day: true
    } : null
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};

function convertTo24h(timeStr: string) {
  if (!timeStr) return '00:00';
  const [time, modifier] = timeStr.trim().split(' ');
  let [hours, minutes] = time.split(':');
  if (hours === '12') hours = '00';
  if (modifier === 'PM' && hours !== '12') hours = String(parseInt(hours, 10) + 12);
  return `${hours.padStart(2, '0')}:${minutes}`;
}

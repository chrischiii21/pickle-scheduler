import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';
import crypto from 'node:crypto';

export const POST: APIRoute = async ({ request }) => {
  const data = await request.json();
  const { court_id, renter_name, renter_email, renter_phone, slots } = data;

  if (!court_id || !renter_name || !renter_email || !slots || slots.length === 0) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 });
  }

  const transaction_id = crypto.randomUUID();
  const booking_ids: string[] = [];

  // 0. Fetch Court Config
  const { data: court } = await supabase.from('courts').select('*').eq('id', court_id).single();
  if (!court) return new Response(JSON.stringify({ error: 'Court not found' }), { status: 404 });

  const globalPlayerCount = data.player_count || 1;

  // 1. Double Booking & Capacity Check
  for (const slot of slots) {
    let query = supabase
      .from('bookings')
      .select('is_open_play, player_count')
      .eq('court_id', court_id)
      .neq('status', 'declined') // Only active ones
      .neq('status', 'cancelled');

    if (slot.manual_slot_id) {
      query = query.eq('manual_slot_id', slot.manual_slot_id).eq('start_time', slot.start_time);
    } else {
      query = query.eq('start_time', slot.start_time);
    }

    const { data: existing } = await query;
    const isNewExclusive = !slot.is_open_play;

    if (existing && existing.length > 0) {
      // If we want to book exclusively, but there are already bookings
      if (isNewExclusive) {
        return new Response(JSON.stringify({ error: `Slot ${slot.manual_slot_id || 'at selected time'} is already partially or fully booked. Private play requires an empty slot.` }), { status: 409 });
      }

      // If we want to book open play, but there is an exclusive booking
      const hasExclusive = existing.some(b => !b.is_open_play);
      if (hasExclusive) {
        return new Response(JSON.stringify({ error: `Slot ${slot.manual_slot_id || 'at selected time'} is booked for private/exclusive play.` }), { status: 409 });
      }

      // Check capacity for open play
      const currentPlayers = existing.reduce((sum, b) => sum + (b.player_count || 1), 0);
      if (currentPlayers + globalPlayerCount > (court.max_players || 4)) {
        return new Response(JSON.stringify({ error: `Slot ${slot.manual_slot_id || 'at selected time'} is full. Only ${court.max_players - currentPlayers} spots left.` }), { status: 409 });
      }
    }
  }

  // 2. Insert Bookings
  for (const slot of slots) {
    const { data: booking, error: dbError } = await supabase
      .from('bookings')
      .insert([
        {
          court_id,
          renter_name,
          renter_email,
          renter_phone,
          start_time: slot.start_time,
          end_time: slot.end_time,
          manual_slot_id: slot.manual_slot_id,
          is_open_play: slot.is_open_play || false,
          player_count: globalPlayerCount,
          status: 'pending',
          transaction_id
        },
      ])
      .select()
      .single();

    if (dbError) {
      return new Response(JSON.stringify({ error: dbError.message }), { status: 500 });
    }
    
    booking_ids.push(booking.id);
  }

  return new Response(JSON.stringify({ success: true, transaction_id, booking_ids }), { status: 200 });
};

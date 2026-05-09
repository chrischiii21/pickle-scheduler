-- Courts Table
CREATE TABLE courts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    manager_id UUID REFERENCES auth.users(id),
    base_price DECIMAL(10, 2) DEFAULT 0.00,
    pricing_interval TEXT DEFAULT 'hour', -- hour, week, month
    allow_open_play BOOLEAN DEFAULT false,
    max_players INTEGER DEFAULT 4,
    start_hour INTEGER DEFAULT 8,
    end_hour INTEGER DEFAULT 22,
    manual_slots JSONB, -- Stores array of slot objects: {start, end, price, type}
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Availability Table (Weekly standard hours)
CREATE TABLE availability (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    court_id UUID REFERENCES courts(id) ON DELETE CASCADE,
    day_of_week INT CHECK (day_of_week >= 0 AND day_of_week <= 6),
    open_time TIME NOT NULL,
    close_time TIME NOT NULL
);

-- Bookings Table
CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    court_id UUID REFERENCES courts(id) ON DELETE CASCADE,
    renter_name TEXT NOT NULL,
    renter_email TEXT NOT NULL,
    renter_phone TEXT,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    gcal_event_id TEXT,
    status TEXT DEFAULT 'confirmed', -- pending, confirmed, cancelled
    is_open_play BOOLEAN DEFAULT false,
    player_count INTEGER DEFAULT 1,
    transaction_id TEXT,
    manual_slot_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Blackouts Table
CREATE TABLE blackouts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    court_id UUID REFERENCES courts(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS Policies (Simplified for development)
ALTER TABLE courts ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE blackouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access for courts" ON courts FOR SELECT USING (true);
CREATE POLICY "Public insert for courts" ON courts FOR INSERT WITH CHECK (true);
CREATE POLICY "Public delete for courts" ON courts FOR DELETE USING (true);
CREATE POLICY "Public read access for availability" ON availability FOR SELECT USING (true);
CREATE POLICY "Public read access for bookings" ON bookings FOR SELECT USING (true);
CREATE POLICY "Public read access for blackouts" ON blackouts FOR SELECT USING (true);
CREATE POLICY "Public insert for bookings" ON bookings FOR INSERT WITH CHECK (true);
CREATE POLICY "Public insert for blackouts" ON blackouts FOR INSERT WITH CHECK (true);
CREATE POLICY "Public delete for blackouts" ON blackouts FOR DELETE USING (true);

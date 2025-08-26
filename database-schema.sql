-- Create shifts table for DashTrack
CREATE TABLE shifts (
  id SERIAL PRIMARY KEY,
  user_id UUID DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  shift_minutes INTEGER NOT NULL,
  break_minutes INTEGER DEFAULT 0,
  working_minutes INTEGER NOT NULL,
  gross DECIMAL(10,2) NOT NULL,
  net DECIMAL(10,2) NOT NULL,
  hourly DECIMAL(10,2) NOT NULL,
  miles_start DECIMAL(8,2) NOT NULL,
  miles_end DECIMAL(8,2) NOT NULL,
  miles_driven DECIMAL(8,2) NOT NULL,
  gallons DECIMAL(6,2) DEFAULT 0,
  price_per_gal DECIMAL(6,2) DEFAULT 0,
  gas_cost DECIMAL(8,2) DEFAULT 0,
  breaks JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations (for now - you can restrict this later)
CREATE POLICY "Allow all operations" ON shifts FOR ALL USING (true);

-- Create indexes for better performance
CREATE INDEX idx_shifts_date ON shifts(date);
CREATE INDEX idx_shifts_user_id ON shifts(user_id);
CREATE INDEX idx_shifts_created_at ON shifts(created_at);

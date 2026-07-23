-- 1. Help Request Categories Table
CREATE TABLE IF NOT EXISTS request_categories (
    category_id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE, -- e.g., 'Medical Supplies', 'Food & Water', 'Pet Rescue', 'Shelter'
    description TEXT,
    icon_name VARCHAR(50),            -- UI icon mapping
    created_at TIMESTAMP WITH TIMEZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Help Requests Table
CREATE TABLE IF NOT EXISTS help_requests (
    id SERIAL PRIMARY KEY,
    title VARCHAR(150) NOT NULL,
    category VARCHAR(50) NOT NULL CHECK (category IN ('Water', 'Food', 'Medical', 'Shelter', 'Transport', 'Other')),
    quantity_needed INT NOT NULL DEFAULT 1,
    location VARCHAR(255) NOT NULL,
    urgency VARCHAR(20) NOT NULL CHECK (urgency IN ('Low', 'Medium', 'High', 'Critical')),
    status VARCHAR(20) NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Matched', 'Fulfilled', 'Closed')),
    requester VARCHAR(100), -- Matches request.requester in views
    created_at TIMESTAMP WITH TIMEZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIMEZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexing for high-performance spatial/urgency queries
CREATE INDEX idx_help_requests_status ON help_requests(status);
CREATE INDEX idx_help_requests_urgency ON help_requests(urgency);
CREATE INDEX idx_help_requests_requester ON help_requests(requester);
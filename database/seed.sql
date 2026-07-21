INSERT INTO users (id, name, email, role) VALUES
    (1, 'Hariharan Thiagarajan', 'hari.member3@crisishub.local', 'user'),
    (2, 'Community User', 'community.user@crisishub.local', 'user'),
    (3, 'CrisisHub Admin', 'admin@crisishub.local', 'admin')
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    role = VALUES(role);

INSERT INTO help_requests (id, user_id, title, category, quantity_needed, location, urgency, status) VALUES
    (1, 2, 'Family needs bottled water', 'Water', 5, 'Jurong', 'High', 'Open'),
    (2, 2, 'First aid supplies for elderly resident', 'Medical', 2, 'Woodlands', 'Critical', 'Open'),
    (3, 2, 'Blankets needed at temporary shelter', 'Shelter', 8, 'Tampines', 'Medium', 'Open')
ON DUPLICATE KEY UPDATE
    title = VALUES(title),
    quantity_needed = VALUES(quantity_needed),
    status = VALUES(status);

INSERT INTO incidents (id, user_id, title, category, description, location, severity, status) VALUES
    (1, 3, 'Flooding in common corridor', 'Infrastructure', 'Water is pooling near the lifts. Evacuation may be needed if level rises.', 'Jurong West', 'High', 'Reported'),
    (2, 3, 'Power outage at bus interchange', 'Safety', 'Several streetlights and signals have gone dark after the storm.', 'Woodlands', 'Medium', 'Verified'),
    (3, 3, 'Medical cluster alert at temporary shelter', 'Medical', 'Multiple residents showing symptoms and needing first aid supplies.', 'Tampines', 'Critical', 'In Progress')
ON DUPLICATE KEY UPDATE
    title = VALUES(title),
    description = VALUES(description),
    location = VALUES(location),
    severity = VALUES(severity),
    status = VALUES(status);

INSERT INTO resource_offers (id, user_id, category, item_name, quantity, location, notes, status) VALUES
    (1, 1, 'Water', 'Bottled water', 10, 'Jurong', 'Can deliver within the neighbourhood.', 'Available'),
    (2, 1, 'Food', 'Ready-to-eat meal packs', 15, 'Yishun', 'Vegetarian packs available.', 'Available')
ON DUPLICATE KEY UPDATE
    item_name = VALUES(item_name),
    quantity = VALUES(quantity),
    status = VALUES(status);

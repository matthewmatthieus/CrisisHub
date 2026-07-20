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

INSERT INTO resource_offers (id, user_id, category, item_name, quantity, location, notes, status) VALUES
    (1, 1, 'Water', 'Bottled water', 10, 'Jurong', 'Can deliver within the neighbourhood.', 'Available'),
    (2, 1, 'Food', 'Ready-to-eat meal packs', 15, 'Yishun', 'Vegetarian packs available.', 'Available')
ON DUPLICATE KEY UPDATE
    item_name = VALUES(item_name),
    quantity = VALUES(quantity),
    status = VALUES(status);

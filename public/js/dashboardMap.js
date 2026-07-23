(function () {
    const mapToggle = document.getElementById('dashboardMapToggle');
    const reportsPanel = document.getElementById('dashboardReportsPanel');
    const mapPanel = document.getElementById('dashboardMapPanel');
    const mapContainer = document.getElementById('dashboardMap');
    const mapMessage = document.getElementById('dashboardMapMessage');
    const mapReset = document.getElementById('dashboardMapReset');
    const filterButtons = document.querySelectorAll('[data-map-type]');

    if (!mapToggle || !reportsPanel || !mapPanel || !mapContainer || typeof L === 'undefined') {
        return;
    }

    const markerColors = {
        incident: '#facc15',
        'help-request': '#ef4444',
        resource: '#22c55e'
    };
    const markerLayers = {
        incident: L.layerGroup(),
        'help-request': L.layerGroup(),
        resource: L.layerGroup()
    };

    let map;
    let mapLoadPromise;
    let isMapVisible = false;
    let markerById = new Map();
    let countdownTimer;
    const defaultMapCenter = [1.3521, 103.8198];
    const defaultMapZoom = 11;
    const params = new URLSearchParams(window.location.search);
    const requestedMapType = params.get('map');
    const requestedItemId = params.get('item');

    function escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    function getTypeLabel(type) {
        return {
            incident: 'Incident',
            'help-request': 'Help Request',
            resource: 'Resource'
        }[type] || 'Report';
    }

    function buildPopup(item) {
        const imageMarkup = item.imageUrl
            ? `<img class="map-popup-image" src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title || 'Resource')} image">`
            : '';
        const details = [
            `<span class="map-popup-detail"><strong>Type:</strong> ${escapeHtml(getTypeLabel(item.type))}</span>`,
            `<span class="map-popup-detail"><strong>Location:</strong> ${escapeHtml(item.location || 'Unknown')}</span>`,
            `<span class="map-popup-detail"><strong>Status:</strong> ${escapeHtml(item.status || 'Unknown')}</span>`
        ];

        if (item.category) {
            details.push(`<span class="map-popup-detail"><strong>Category:</strong> ${escapeHtml(item.category)}</span>`);
        }
        if (item.severity) {
            details.push(`<span class="map-popup-detail"><strong>Severity:</strong> ${escapeHtml(item.severity)}</span>`);
        }
        if (item.urgency) {
            details.push(`<span class="map-popup-detail"><strong>Urgency:</strong> ${escapeHtml(item.urgency)}</span>`);
        }
        if (item.quantity !== undefined && item.quantity !== null) {
            details.push(`<span class="map-popup-detail"><strong>Quantity:</strong> ${escapeHtml(item.quantity)}</span>`);
        }
        if (item.type === 'resource' && item.expiresAt) {
            const countdown = window.CrisisHubExpiry
                ? window.CrisisHubExpiry.formatCountdown(item.expiresAt)
                : 'Calculating...';
            details.push(`<span class="map-popup-detail map-popup-expiry"><strong>Expiry:</strong> ${escapeHtml(countdown)}</span>`);
        }
        if (item.approximate) {
            details.push('<span class="map-popup-approximate">Approximate central Singapore location</span>');
        }

        return `${imageMarkup}<strong class="map-popup-title">${escapeHtml(item.title || 'Untitled report')}</strong>${details.join('')}`;
    }

    function showMapMessage(message) {
        mapMessage.textContent = message;
        mapMessage.hidden = false;
    }

    function hideMapMessage() {
        mapMessage.hidden = true;
        mapMessage.textContent = '';
    }

    function initializeMap() {
        if (map) {
            return;
        }

        map = L.map(mapContainer, {
            zoomControl: true,
            minZoom: 10,
            maxBounds: [[1.16, 103.55], [1.52, 104.12]],
            maxBoundsViscosity: 0.7
        }).setView(defaultMapCenter, defaultMapZoom);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        Object.values(markerLayers).forEach((layer) => layer.addTo(map));
    }

    function setLayerVisible(type, isVisible) {
        const layer = markerLayers[type];
        const button = document.querySelector(`[data-map-type="${type}"]`);

        if (!layer) {
            return;
        }

        if (button) {
            button.classList.toggle('is-active', isVisible);
            button.setAttribute('aria-pressed', String(isVisible));
        }

        if (!map) {
            return;
        }

        if (isVisible) {
            layer.addTo(map);
        } else {
            map.removeLayer(layer);
        }
    }

    function applyMapTypeFilter(type) {
        const validType = Object.prototype.hasOwnProperty.call(markerLayers, type);

        Object.keys(markerLayers).forEach((markerType) => {
            setLayerVisible(markerType, !validType || markerType === type);
        });
    }

    function focusMarker(itemId) {
        const marker = markerById.get(itemId);

        if (!map || !marker) {
            return;
        }

        map.setView(marker.getLatLng(), 14, { animate: true });
        marker.openTooltip();
        map.once('popupopen', ({ popup }) => centerPopupInMap(popup));
        marker.openPopup();
    }

    function centerPopupInMap(popup) {
        const popupElement = popup && popup.getElement();

        if (!map || !popupElement) {
            return;
        }

        window.requestAnimationFrame(() => {
            const mapBounds = mapContainer.getBoundingClientRect();
            const popupBounds = popupElement.getBoundingClientRect();
            const mapCenterX = mapBounds.left + (mapBounds.width / 2);
            const mapCenterY = mapBounds.top + (mapBounds.height / 2);
            const popupCenterX = popupBounds.left + (popupBounds.width / 2);
            const popupCenterY = popupBounds.top + (popupBounds.height / 2);

            map.panBy([
                mapCenterX - popupCenterX,
                mapCenterY - popupCenterY
            ], { animate: true });
        });
    }

    function resetMapView() {
        if (!map) {
            return;
        }

        map.closePopup();
        map.setView(defaultMapCenter, defaultMapZoom, { animate: true });
    }

    function refreshResourceCountdowns() {
        markerById.forEach((marker) => {
            const item = marker.crisishubItem;
            if (!item || item.type !== 'resource' || !item.expiresAt) {
                return;
            }

            const popupContent = buildPopup(item);
            marker.setPopupContent(popupContent);
            marker.setTooltipContent(popupContent);
        });
    }

    async function loadMapItems() {
        if (mapLoadPromise) {
            return mapLoadPromise;
        }

        mapLoadPromise = (async () => {
            showMapMessage('Loading map reports...');

            const response = await fetch('/api/map-items', {
                headers: { Accept: 'application/json' }
            });

            if (!response.ok) {
                throw new Error('Map data request failed.');
            }

            const data = await response.json();
            Object.values(markerLayers).forEach((layer) => layer.clearLayers());
            markerById = new Map();

            data.items.forEach((item) => {
                const layer = markerLayers[item.type];
                if (!layer) {
                    return;
                }

                const marker = L.circleMarker([item.latitude, item.longitude], {
                    radius: 9,
                    color: '#ffffff',
                    weight: 2,
                    fillColor: markerColors[item.type],
                    fillOpacity: 0.95
                })
                    .bindTooltip(buildPopup(item), {
                        direction: 'top',
                        offset: [0, -10],
                        opacity: 1,
                        className: 'crisishub-map-tooltip'
                    })
                    .bindPopup(buildPopup(item))
                    .addTo(layer);

                marker.crisishubItem = item;

                marker.on('click', () => {
                    map.panTo(marker.getLatLng(), { animate: true });
                    map.once('popupopen', ({ popup }) => {
                        window.setTimeout(() => centerPopupInMap(popup), 300);
                    });
                    marker.openPopup();
                });

                markerById.set(item.id, marker);
            });

            hideMapMessage();

            if (!countdownTimer) {
                countdownTimer = window.setInterval(refreshResourceCountdowns, 1000);
            }

            if (requestedItemId) {
                focusMarker(requestedItemId);
            }
        })().catch((error) => {
            mapLoadPromise = null;
            showMapMessage('Unable to load map reports. Please try again.');
            throw error;
        });

        return mapLoadPromise;
    }

    async function showMap(type = null) {
        isMapVisible = true;
        mapToggle.classList.add('is-active');
        mapToggle.setAttribute('aria-pressed', 'true');
        reportsPanel.classList.add('is-hidden');
        reportsPanel.setAttribute('aria-hidden', 'true');
        reportsPanel.inert = true;
        mapPanel.classList.add('is-visible');
        mapPanel.setAttribute('aria-hidden', 'false');
        mapPanel.inert = false;

        initializeMap();
        applyMapTypeFilter(type);
        window.setTimeout(() => map.invalidateSize(), 480);

        try {
            await loadMapItems();
        } catch (error) {
            console.error(error);
        }
    }

    function showReports() {
        isMapVisible = false;
        mapToggle.classList.remove('is-active');
        mapToggle.setAttribute('aria-pressed', 'false');
        mapPanel.classList.remove('is-visible');
        mapPanel.setAttribute('aria-hidden', 'true');
        mapPanel.inert = true;
        reportsPanel.classList.remove('is-hidden');
        reportsPanel.setAttribute('aria-hidden', 'false');
        reportsPanel.inert = false;
    }

    mapToggle.addEventListener('click', () => {
        if (isMapVisible) {
            showReports();
        } else {
            showMap();
        }
    });

    filterButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const type = button.dataset.mapType;
            const isActive = button.classList.toggle('is-active');

            button.setAttribute('aria-pressed', String(isActive));

            setLayerVisible(type, isActive);
        });
    });

    if (mapReset) {
        mapReset.addEventListener('click', resetMapView);
    }

    if (Object.prototype.hasOwnProperty.call(markerLayers, requestedMapType)) {
        showMap(requestedMapType);
    }
}());

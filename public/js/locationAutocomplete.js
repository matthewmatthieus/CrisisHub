(function () {
    const locationInputs = document.querySelectorAll(
        'input[name="location"], input[data-location-autocomplete="true"]'
    );

    if (!locationInputs.length) {
        return;
    }

    locationInputs.forEach((input, inputIndex) => {
        if (input.dataset.locationAutocompleteReady === 'true') {
            return;
        }

        input.dataset.locationAutocompleteReady = 'true';
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('aria-autocomplete', 'list');
        input.setAttribute('aria-expanded', 'false');

        const wrapper = document.createElement('div');
        wrapper.className = 'location-autocomplete';
        input.parentNode.insertBefore(wrapper, input);
        wrapper.appendChild(input);

        const searchButton = document.createElement('button');
        searchButton.className = 'location-search-button';
        searchButton.type = 'button';
        searchButton.setAttribute('aria-label', 'Search Singapore addresses');
        searchButton.innerHTML = '<i class="bi bi-search" aria-hidden="true"></i>';
        wrapper.appendChild(searchButton);

        const suggestionsPanel = document.createElement('div');
        const suggestionsId = `locationSuggestions-${inputIndex}`;
        suggestionsPanel.className = 'location-suggestions';
        suggestionsPanel.id = suggestionsId;
        suggestionsPanel.setAttribute('role', 'listbox');
        suggestionsPanel.hidden = true;
        wrapper.appendChild(suggestionsPanel);
        input.setAttribute('aria-controls', suggestionsId);

        let debounceTimer;
        let activeRequest;
        let activeIndex = -1;
        let suggestions = [];

        function closeSuggestions() {
            suggestionsPanel.hidden = true;
            input.setAttribute('aria-expanded', 'false');
            input.removeAttribute('aria-activedescendant');
            activeIndex = -1;
        }

        function openSuggestions() {
            suggestionsPanel.hidden = false;
            input.setAttribute('aria-expanded', 'true');
        }

        function renderStatus(message) {
            suggestions = [];
            activeIndex = -1;
            suggestionsPanel.replaceChildren();

            const status = document.createElement('div');
            status.className = 'location-search-status';
            status.textContent = message;
            suggestionsPanel.appendChild(status);
            openSuggestions();
        }

        function selectSuggestion(suggestion) {
            input.value = suggestion.text;
            input.dispatchEvent(new Event('change', { bubbles: true }));
            closeSuggestions();
            input.focus();
        }

        function updateActiveSuggestion(nextIndex) {
            const options = suggestionsPanel.querySelectorAll('[role="option"]');
            if (!options.length) {
                return;
            }

            activeIndex = (nextIndex + options.length) % options.length;
            options.forEach((option, index) => {
                const isActive = index === activeIndex;
                option.classList.toggle('is-active', isActive);
                option.setAttribute('aria-selected', String(isActive));
            });

            input.setAttribute('aria-activedescendant', options[activeIndex].id);
            options[activeIndex].scrollIntoView({ block: 'nearest' });
        }

        function renderSuggestions(results) {
            suggestions = results;
            activeIndex = -1;
            suggestionsPanel.replaceChildren();

            if (!results.length) {
                renderStatus('No Singapore addresses found.');
                return;
            }

            const label = document.createElement('span');
            label.className = 'location-suggestions-label';
            label.textContent = 'Suggestions';
            suggestionsPanel.appendChild(label);

            results.forEach((suggestion, suggestionIndex) => {
                const option = document.createElement('button');
                option.className = 'location-suggestion';
                option.type = 'button';
                option.id = `${suggestionsId}-option-${suggestionIndex}`;
                option.setAttribute('role', 'option');
                option.setAttribute('aria-selected', 'false');

                const icon = document.createElement('i');
                icon.className = 'bi bi-geo-alt-fill';
                icon.setAttribute('aria-hidden', 'true');

                const text = document.createElement('span');
                text.textContent = suggestion.text;

                option.append(icon, text);
                option.addEventListener('mousedown', (event) => event.preventDefault());
                option.addEventListener('click', () => selectSuggestion(suggestion));
                suggestionsPanel.appendChild(option);
            });

            const attribution = document.createElement('small');
            attribution.className = 'location-attribution';
            attribution.textContent = 'Powered by Esri';
            suggestionsPanel.appendChild(attribution);
            openSuggestions();
        }

        async function searchLocations() {
            const query = input.value.trim();

            if (query.length < 3) {
                closeSuggestions();
                return;
            }

            if (activeRequest) {
                activeRequest.abort();
            }

            const requestController = new AbortController();
            activeRequest = requestController;
            renderStatus('Searching Singapore addresses...');

            try {
                const response = await fetch(`/api/location-suggestions?q=${encodeURIComponent(query)}`, {
                    headers: { Accept: 'application/json' },
                    signal: requestController.signal
                });

                if (!response.ok) {
                    throw new Error('Location search request failed.');
                }

                const data = await response.json();
                renderSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
            } catch (error) {
                if (error.name !== 'AbortError') {
                    renderStatus('Location search is temporarily unavailable.');
                }
            } finally {
                if (activeRequest === requestController) {
                    activeRequest = null;
                }
            }
        }

        input.addEventListener('input', () => {
            window.clearTimeout(debounceTimer);
            debounceTimer = window.setTimeout(searchLocations, 300);
        });

        input.addEventListener('keydown', (event) => {
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                updateActiveSuggestion(activeIndex + 1);
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                updateActiveSuggestion(activeIndex - 1);
            } else if (event.key === 'Enter' && activeIndex >= 0) {
                event.preventDefault();
                selectSuggestion(suggestions[activeIndex]);
            } else if (event.key === 'Escape') {
                closeSuggestions();
            }
        });

        input.addEventListener('focus', () => {
            if (suggestions.length) {
                openSuggestions();
            }
        });

        searchButton.addEventListener('click', searchLocations);

        document.addEventListener('click', (event) => {
            if (!wrapper.contains(event.target)) {
                closeSuggestions();
            }
        });
    });
}());

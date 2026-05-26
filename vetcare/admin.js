(function () {
    const cfg = window.VETCARE_SUPABASE;
    const supabaseLib = window.supabase;

    const authCard = document.getElementById('auth-card');
    const adminApp = document.getElementById('admin-app');
    const authMessage = document.getElementById('auth-message');
    const panelMessage = document.getElementById('panel-message');
    const logoutBtn = document.getElementById('logout-btn');

    const IMAGE_KEYS = [
        { key: 'hero_slider_1', label: 'Hero Slider 1' },
        { key: 'hero_slider_2', label: 'Hero Slider 2' },
        { key: 'hero_slider_3', label: 'Hero Slider 3' },
        { key: 'hero_slider_4', label: 'Hero Slider 4' },
        { key: 'gallery_horse', label: 'Gallery Horse' },
        { key: 'gallery_dog', label: 'Gallery Dog' },
        { key: 'gallery_chicken', label: 'Gallery Chicken' },
        { key: 'gallery_cow', label: 'Gallery Cow' },
        { key: 'gallery_cat', label: 'Gallery Cat' },
        { key: 'gallery_sheep', label: 'Gallery Sheep' },
        { key: 'services_vet', label: 'Services Vet Image' }
    ];

    const BUTTON_KEYS = [
        { key: 'nav_book_appointment', label: 'Top Nav Book Appointment' },
        { key: 'mobile_nav_book_appointment', label: 'Mobile Nav Book Appointment' },
        { key: 'hero_schedule_visit', label: 'Hero Schedule Visit' },
        { key: 'hero_view_services', label: 'Hero View Services' },
        { key: 'home_view_all_services', label: 'Home View All Services' },
        { key: 'cta_book_visit', label: 'CTA Book Your Visit' },
        { key: 'cta_call', label: 'CTA Call' },
        { key: 'social_whatsapp', label: 'Footer WhatsApp' },
        { key: 'social_instagram', label: 'Footer Instagram' },
        { key: 'social_facebook', label: 'Footer Facebook' }
    ];

    const LANGUAGE_OPTIONS = [
        { code: 'en', label: 'English' },
        { code: 'ar', label: 'Arabic' },
        { code: 'ku', label: 'Kurdish' }
    ];

    const CONTENT_SECTION_TITLES = {
        nav: 'Navigation',
        home: 'Homepage',
        services: 'Services',
        appointments: 'Appointments',
        contact: 'Contact'
    };

    const IMAGE_DEFAULTS = {
        hero_slider_1: 'assets/images/horse.webp',
        hero_slider_2: 'assets/images/vet.webp',
        hero_slider_3: 'assets/images/cow.webp',
        hero_slider_4: 'assets/images/cat.webp',
        gallery_horse: 'assets/images/horse.webp',
        gallery_dog: 'assets/images/dog.webp',
        gallery_chicken: 'assets/images/chicken.webp',
        gallery_cow: 'assets/images/cow.webp',
        gallery_cat: 'assets/images/cat.webp',
        gallery_sheep: 'assets/images/sheep.webp',
        services_vet: 'assets/images/vet.webp'
    };

    let client = null;
    let currentSession = null;
    let currentRole = null;
    let imageOverrides = {};
    let buttonOverrides = {};
    let contentOverrideRows = [];
    let contentOverrideLookup = { en: {}, ar: {}, ku: {} };
    let contentSearchQuery = '';
    let imageSearchQuery = '';
    let contentStudioInitialized = false;
    let mediaStudioInitialized = false;
    let renderContentStudio = null;
    let renderImageStudio = null;
    let populateQuickBusinessForm = null;
    let panelMessageTimer = null;
    let dashboardStats = {
        pendingAppointments: 0,
        newMessages: 0,
        overrides: 0,
        admins: 0
    };

    function updateCounter(elementId, value) {
        const el = document.getElementById(elementId);
        if (!el) {
            return;
        }
        const safeValue = Number.isFinite(value) ? String(value) : '0';
        el.textContent = safeValue;
    }

    function updateOperationsMetrics(state) {
        dashboardStats = Object.assign({}, dashboardStats, state || {});

        updateCounter('metric-pending', dashboardStats.pendingAppointments);
        updateCounter('metric-new-messages', dashboardStats.newMessages);
        updateCounter('metric-overrides', dashboardStats.overrides);
        updateCounter('metric-admins', dashboardStats.admins);

        updateCounter('badge-appointments', dashboardStats.pendingAppointments);
        updateCounter('badge-messages', dashboardStats.newMessages);
        updateCounter('badge-overrides', dashboardStats.overrides);
        updateCounter('badge-admins', dashboardStats.admins);
    }

    function setMessage(message, isError) {
        panelMessage.textContent = message;
        panelMessage.classList.remove('text-red-600', 'text-emerald-700', 'text-slate-600');
        panelMessage.classList.add(isError ? 'text-red-600' : 'text-emerald-700');

        if (panelMessageTimer) {
            clearTimeout(panelMessageTimer);
        }

        panelMessageTimer = setTimeout(() => {
            panelMessage.textContent = '';
            panelMessage.classList.remove('text-red-600', 'text-emerald-700');
            panelMessage.classList.add('text-slate-600');
        }, 5000);
    }

    function flattenKeys(obj, prefix) {
        return Object.keys(obj).reduce((acc, key) => {
            const value = obj[key];
            const next = prefix ? prefix + '.' + key : key;
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                return acc.concat(flattenKeys(value, next));
            }
            acc.push(next);
            return acc;
        }, []);
    }

    function getByPath(obj, path) {
        return path.split('.').reduce((acc, part) => (acc ? acc[part] : undefined), obj);
    }

    function humanizeKey(key) {
        return String(key || '')
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/_/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/^./, (value) => value.toUpperCase());
    }

    function getSectionTitle(section) {
        return CONTENT_SECTION_TITLES[section] || humanizeKey(section);
    }

    function getSectionKeys(section) {
        const sectionObject = window.translations?.en?.[section];
        if (!sectionObject || typeof sectionObject !== 'object') {
            return [];
        }

        return Object.keys(sectionObject);
    }

    function getBaseContentValue(lang, key) {
        return getByPath(window.translations?.[lang] || {}, key) || '';
    }

    function getEffectiveContentValue(lang, key) {
        return contentOverrideLookup?.[lang]?.[key] ?? getBaseContentValue(lang, key);
    }

    function setContentOverrideLookup(rows) {
        contentOverrideLookup = { en: {}, ar: {}, ku: {} };

        rows.forEach((row) => {
            if (!contentOverrideLookup[row.lang]) {
                return;
            }
            contentOverrideLookup[row.lang][row.i18n_key] = row.value;
        });
    }

    function getImageGroupTitle(key) {
        if (key.startsWith('hero_slider')) {
            return 'Homepage Hero';
        }
        if (key.startsWith('gallery_')) {
            return 'Gallery';
        }
        if (key === 'services_vet') {
            return 'Services';
        }
        return 'Assets';
    }

    function getDefaultImageValue(key) {
        return IMAGE_DEFAULTS[key] || '';
    }

    function getCurrentImageValue(key) {
        return imageOverrides[key] || getDefaultImageValue(key);
    }

    function getGroupedImageKeys() {
        return IMAGE_KEYS.reduce((acc, item) => {
            const group = getImageGroupTitle(item.key);
            if (!acc[group]) {
                acc[group] = [];
            }
            acc[group].push(item);
            return acc;
        }, {});
    }

    function buildSectionStats() {
        const sections = Object.keys(window.translations?.en || {});
        const totalKeys = sections.reduce((count, section) => count + getSectionKeys(section).length, 0);
        const overrideCount = contentOverrideRows.length;
        return { sections, totalKeys, overrideCount };
    }

    function matchesSearch(text, query) {
        if (!query) {
            return true;
        }

        return String(text || '').toLowerCase().includes(query);
    }

    function isSameAsBaseValue(lang, key, value) {
        return String(value ?? '') === String(getBaseContentValue(lang, key));
    }

    function sanitizePathOrUrl(value) {
        if (typeof value !== 'string') {
            return '';
        }

        const trimmed = value.trim();
        if (!trimmed) {
            return '';
        }

        if (/["'<>\s]/.test(trimmed)) {
            return '';
        }

        if (trimmed.startsWith('#') || trimmed.startsWith('/')) {
            return trimmed;
        }

        if (/^(https?:)?\/\//i.test(trimmed)) {
            return trimmed;
        }

        if (/^[A-Za-z0-9._\/-]+$/.test(trimmed)) {
            return trimmed;
        }

        return '';
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    function isValidEmail(value) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    }

    function extractLinkedLine(value) {
        const html = String(value || '');
        const linkedMatch = html.match(/<a[^>]*href=\"([^\"]+)\"[^>]*>(.*?)<\/a>\s*(?:<br\s*\/?>(.*))?/i);
        if (linkedMatch) {
            return {
                href: linkedMatch[1] || '',
                text: (linkedMatch[2] || '').replace(/<[^>]+>/g, '').trim(),
                tail: (linkedMatch[3] || '').replace(/<[^>]+>/g, '').trim()
            };
        }

        const plain = html.replace(/<[^>]+>/g, '').trim();
        return {
            href: '',
            text: plain,
            tail: ''
        };
    }

    async function saveContentValue(lang, key, nextValue) {
        if (isSameAsBaseValue(lang, key, nextValue)) {
            const { error: deleteError } = await client
                .from('content_overrides')
                .delete()
                .eq('lang', lang)
                .eq('i18n_key', key);

            if (deleteError) {
                throw deleteError;
            }
            return;
        }

        const { error } = await client
            .from('content_overrides')
            .upsert({ lang: lang, i18n_key: key, value: nextValue }, { onConflict: 'lang,i18n_key' });

        if (error) {
            throw error;
        }
    }

    async function getRole(userId) {
        const { data, error } = await client
            .from('admin_profiles')
            .select('role')
            .eq('user_id', userId)
            .maybeSingle();

        if (error || !data) {
            return null;
        }
        return data.role;
    }

    async function requireAdmin() {
        const { data } = await client.auth.getSession();
        currentSession = data.session;

        if (!currentSession?.user) {
            authCard.classList.remove('hidden');
            adminApp.classList.add('hidden');
            logoutBtn.classList.add('hidden');
            return false;
        }

        currentRole = await getRole(currentSession.user.id);
        if (!currentRole) {
            authCard.classList.remove('hidden');
            adminApp.classList.add('hidden');
            logoutBtn.classList.add('hidden');
            authMessage.textContent = 'This user is not an admin.';
            return false;
        }

        authCard.classList.add('hidden');
        adminApp.classList.remove('hidden');
        logoutBtn.classList.remove('hidden');

        if (currentRole !== 'super_admin') {
            const inviteForm = document.getElementById('invite-admin-form');
            if (inviteForm) {
                inviteForm.classList.add('hidden');
            }
        }

        return true;
    }

    function initTabs() {
        const tabs = document.querySelectorAll('.tab-btn');
        const panels = document.querySelectorAll('.tab-panel');

        function activateTab(btn) {
            tabs.forEach((t) => {
                t.classList.remove('bg-emerald-700', 'text-white');
                t.classList.add('bg-slate-200');
                t.setAttribute('aria-selected', 'false');
            });

            btn.classList.remove('bg-slate-200');
            btn.classList.add('bg-emerald-700', 'text-white');
            btn.setAttribute('aria-selected', 'true');

            panels.forEach((p) => p.classList.add('hidden'));
            const activePanel = document.getElementById('tab-' + btn.dataset.tab);
            if (activePanel) {
                activePanel.classList.remove('hidden');
            }
        }

        tabs.forEach((btn) => {
            btn.setAttribute('role', 'tab');
            btn.setAttribute('aria-selected', btn.classList.contains('bg-emerald-700') ? 'true' : 'false');

            btn.addEventListener('click', () => {
                activateTab(btn);
            });

            btn.addEventListener('keydown', (event) => {
                if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') {
                    return;
                }

                event.preventDefault();
                const currentIndex = Array.from(tabs).indexOf(btn);
                const delta = event.key === 'ArrowRight' ? 1 : -1;
                const nextIndex = (currentIndex + delta + tabs.length) % tabs.length;
                tabs[nextIndex].focus();
                activateTab(tabs[nextIndex]);
            });
        });
    }

    function getAuthHeaders() {
        return {
            Authorization: 'Bearer ' + currentSession.access_token,
            'Content-Type': 'application/json'
        };
    }

    function appointmentCard(appointment) {
        const safeId = escapeHtml(appointment.id);
        const safeName = escapeHtml(appointment.full_name);
        const safeEmail = escapeHtml(appointment.email);
        const safePhone = escapeHtml(appointment.phone || '-');
        const safeAnimal = escapeHtml(appointment.animal_type || '-');
        const safeDate = escapeHtml(appointment.preferred_date || '-');
        const safeTime = escapeHtml(appointment.preferred_time || '-');
        const safeMessage = escapeHtml(appointment.message || '');
        const safeStatus = escapeHtml(appointment.status);

        return [
            '<div class="border border-slate-200 rounded-lg p-4">',
            '<div class="flex flex-wrap items-start justify-between gap-2">',
            '<div>',
            '<p class="font-semibold">' + safeName + ' (' + safeEmail + ')</p>',
            '<p class="text-sm text-slate-600">' + safePhone + ' | ' + safeAnimal + '</p>',
            '<p class="text-sm text-slate-600">Date: ' + safeDate + ' Time: ' + safeTime + '</p>',
            '<p class="text-sm mt-1">' + safeMessage + '</p>',
            '</div>',
            '<div class="flex flex-col items-end gap-2">',
            '<span class="px-2 py-1 rounded text-xs bg-slate-100">' + safeStatus + '</span>',
            appointment.status === 'pending'
                ? '<div class="flex gap-2"><button data-action="accept" data-id="' + safeId + '" class="appt-action px-3 py-1 rounded bg-emerald-700 text-white text-sm">Accept</button><button data-action="deny" data-id="' + safeId + '" class="appt-action px-3 py-1 rounded bg-red-600 text-white text-sm">Deny</button></div>'
                : '',
            '</div>',
            '</div>',
            '</div>'
        ].join('');
    }

    async function loadAppointments() {
        const { data, error } = await client
            .from('appointments')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            setMessage('Failed to load appointments.', true);
            return;
        }

        const container = document.getElementById('appointments-list');
        const rows = data || [];
        container.innerHTML = rows.map(appointmentCard).join('');

        const pendingCount = rows.filter((row) => row.status === 'pending').length;
        updateOperationsMetrics({ pendingAppointments: pendingCount });

        container.querySelectorAll('.appt-action').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const action = btn.dataset.action;
                const appointmentId = btn.dataset.id;
                const reason = action === 'deny' ? (prompt('Reason for rejection (optional):') || '') : '';

                const res = await fetch(cfg.functionsBaseUrl + '/appointments-status', {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({ appointmentId: appointmentId, action: action, reason: reason })
                });

                const payload = await res.json().catch(() => ({}));
                if (!res.ok) {
                    setMessage(payload.error || 'Failed to update appointment.', true);
                    return;
                }

                setMessage('Appointment updated successfully.', false);
                loadAppointments();
            });
        });
    }

    function messageCard(row) {
        const safeId = escapeHtml(row.id);
        const safeName = escapeHtml(row.full_name);
        const safeEmail = escapeHtml(row.email);
        const safePetName = escapeHtml(row.pet_name || '-');
        const safeService = escapeHtml(row.service_inquiry || '-');
        const safeCreatedAt = escapeHtml(row.created_at || '-');
        const safeMessage = escapeHtml(row.message || '');
        const safeStatus = escapeHtml(row.status);
        const canReply = isValidEmail(row.email || '');
        const replySubject = encodeURIComponent('Reply to your message | Gullan Veterinary Clinic');
        const replyBody = encodeURIComponent('Hello ' + (row.full_name || '') + ',\n\nThank you for contacting Gullan Veterinary Clinic.\n\nBest regards,\nGullan Team');
        const replyHref = 'mailto:' + (row.email || '') + '?subject=' + replySubject + '&body=' + replyBody;

        return [
            '<div class="border border-slate-200 rounded-lg p-4">',
            '<div class="flex flex-wrap items-start justify-between gap-2">',
            '<div>',
            '<p class="font-semibold">' + safeName + ' (' + safeEmail + ')</p>',
            '<p class="text-sm text-slate-600">Pet: ' + safePetName + ' | Service: ' + safeService + '</p>',
            '<p class="text-sm text-slate-600">Received: ' + safeCreatedAt + '</p>',
            '<p class="text-sm mt-1">' + safeMessage + '</p>',
            '</div>',
            '<div class="flex flex-col items-end gap-2">',
            '<span class="px-2 py-1 rounded text-xs bg-slate-100">' + safeStatus + '</span>',
            canReply
                ? '<a href="' + escapeHtml(replyHref) + '" class="px-3 py-1 rounded bg-cyan-700 text-white text-sm">Reply</a>'
                : '',
            row.status === 'new'
                ? '<button data-action="resolve" data-id="' + safeId + '" class="msg-action px-3 py-1 rounded bg-emerald-700 text-white text-sm">Mark Resolved</button>'
                : '<button data-action="reopen" data-id="' + safeId + '" class="msg-action px-3 py-1 rounded bg-slate-500 text-white text-sm">Mark New</button>',
            '</div>',
            '</div>',
            '</div>'
        ].join('');
    }

    async function loadMessages() {
        const { data, error } = await client
            .from('contact_messages')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            setMessage('Failed to load contact messages.', true);
            return;
        }

        const container = document.getElementById('messages-list');
        if (!container) {
            return;
        }

        const rows = data || [];
        container.innerHTML = rows.map(messageCard).join('');

        const newMessages = rows.filter((row) => row.status === 'new').length;
        updateOperationsMetrics({ newMessages: newMessages });

        container.querySelectorAll('.msg-action').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const messageId = btn.dataset.id;
                const action = btn.dataset.action;
                const nextStatus = action === 'resolve' ? 'resolved' : 'new';

                const { error: updateError } = await client
                    .from('contact_messages')
                    .update({
                        status: nextStatus,
                        reviewed_by: currentSession?.user?.id || null,
                        reviewed_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', messageId);

                if (updateError) {
                    setMessage('Failed to update message status.', true);
                    return;
                }

                setMessage('Message status updated.', false);
                loadMessages();
            });
        });
    }

    function initContentEditor() {
        const searchInput = document.getElementById('content-search');
        const editor = document.getElementById('content-editor');
        const summary = document.getElementById('content-overview');

        if (!searchInput || !editor || !summary || !window.translations?.en) {
            return;
        }

        if (contentStudioInitialized && typeof renderContentStudio === 'function') {
            renderContentStudio();
            return;
        }

        contentStudioInitialized = true;

        const sectionData = buildSectionStats();
        summary.textContent = sectionData.totalKeys + ' keys in ' + sectionData.sections.length + ' sections';

        renderContentStudio = function () {
            const query = contentSearchQuery.trim().toLowerCase();
            const sections = sectionData.sections;

            editor.innerHTML = sections.map((section) => {
                const keys = getSectionKeys(section);
                const visibleCards = keys.filter((key) => {
                    const fullKey = section + '.' + key;
                    const probe = [
                        section,
                        getSectionTitle(section),
                        key,
                        humanizeKey(key),
                        LANGUAGE_OPTIONS.map((lang) => getEffectiveContentValue(lang.code, fullKey)).join(' ')
                    ].join(' ');
                    return matchesSearch(probe, query);
                });

                const cards = keys.map((key) => {
                    const fullKey = section + '.' + key;
                    const cardProbe = [
                        section,
                        getSectionTitle(section),
                        key,
                        humanizeKey(key),
                        LANGUAGE_OPTIONS.map((lang) => getEffectiveContentValue(lang.code, fullKey)).join(' ')
                    ].join(' ');

                    const hiddenClass = matchesSearch(cardProbe, query) ? '' : ' hidden';

                    return [
                        '<article class="glass content-card' + hiddenClass + ' p-4" data-content-key="' + escapeHtml(fullKey) + '" data-content-section="' + escapeHtml(section) + '">',
                        '<div class="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">',
                        '<div>',
                        '<p class="text-xs uppercase tracking-[0.18em] text-slate-500">' + escapeHtml(getSectionTitle(section)) + '</p>',
                        '<h4 class="text-2xl mb-0">' + escapeHtml(humanizeKey(key)) + '</h4>',
                        '<p class="text-xs text-slate-500 mt-1">' + escapeHtml(fullKey) + '</p>',
                        '</div>',
                        '<div class="flex flex-wrap gap-2">',
                        '<button type="button" class="btn-primary" data-content-action="save" data-content-key="' + escapeHtml(fullKey) + '">Save This Key</button>',
                        '<button type="button" class="btn-ghost" data-content-action="reset" data-content-key="' + escapeHtml(fullKey) + '">Reset To Defaults</button>',
                        '</div>',
                        '</div>',
                        '<div class="grid grid-cols-1 xl:grid-cols-3 gap-3 mt-4">',
                        LANGUAGE_OPTIONS.map((lang) => {
                            const value = escapeHtml(getEffectiveContentValue(lang.code, fullKey));
                            const base = escapeHtml(getBaseContentValue(lang.code, fullKey));
                            return [
                                '<label class="block text-sm font-semibold text-slate-700">',
                                '<span class="flex items-center justify-between gap-2 mb-2">',
                                '<span>' + escapeHtml(lang.label) + '</span>',
                                '<span class="text-[11px] font-normal text-slate-500">Base value available</span>',
                                '</span>',
                                '<textarea rows="6" class="content-value-' + lang.code + ' w-full" data-content-lang="' + lang.code + '" data-base-value="' + base + '">' + value + '</textarea>',
                                '</label>'
                            ].join('');
                        }).join(''),
                        '</div>',
                        '</article>'
                    ].join('');
                }).join('');

                return [
                    '<section class="space-y-3">',
                    '<div class="flex items-center justify-between gap-2 flex-wrap">',
                    '<div>',
                    '<h3 class="text-3xl mb-0">' + escapeHtml(getSectionTitle(section)) + '</h3>',
                    '<p class="text-sm text-slate-600 mb-0">' + visibleCards.length + ' editable keys</p>',
                    '</div>',
                    '</div>',
                    '<div class="space-y-3">' + cards + '</div>',
                    '</section>'
                ].join('');
            }).join('');
        };

        renderContentStudio();

        searchInput.addEventListener('input', () => {
            contentSearchQuery = searchInput.value;
            renderContentStudio();
        });

        editor.addEventListener('click', async (event) => {
            const button = event.target.closest('[data-content-action]');
            if (!button || !editor.contains(button)) {
                return;
            }

            const key = button.dataset.contentKey;
            const card = editor.querySelector('[data-content-key="' + CSS.escape(key) + '"]');
            if (!card) {
                return;
            }

            if (button.dataset.contentAction === 'reset') {
                LANGUAGE_OPTIONS.forEach((lang) => {
                    const textarea = card.querySelector('[data-content-lang="' + lang.code + '"]');
                    if (textarea) {
                        textarea.value = getBaseContentValue(lang.code, key);
                    }
                });
                setMessage('Key reset to base translations. Save it to persist.', false);
                return;
            }

            const saveOperations = LANGUAGE_OPTIONS.map(async (lang) => {
                const textarea = card.querySelector('[data-content-lang="' + lang.code + '"]');
                if (!textarea) {
                    return;
                }

                const nextValue = textarea.value;
                const baseValue = getBaseContentValue(lang.code, key);
                const payload = { lang: lang.code, i18n_key: key, value: nextValue };

                if (isSameAsBaseValue(lang.code, key, nextValue)) {
                    const { error: deleteError } = await client
                        .from('content_overrides')
                        .delete()
                        .eq('lang', lang.code)
                        .eq('i18n_key', key);

                    if (deleteError) {
                        throw deleteError;
                    }
                    return;
                }

                const { error } = await client
                    .from('content_overrides')
                    .upsert(payload, { onConflict: 'lang,i18n_key' });

                if (error) {
                    throw error;
                }
            });

            try {
                await Promise.all(saveOperations);
                await loadOverrides();
                setMessage('Translations saved for ' + humanizeKey(key) + '.', false);
            } catch (error) {
                setMessage('Failed to save one or more language values.', true);
            }
        });
    }

    function initQuickBusinessManager() {
        const form = document.getElementById('quick-business-form');
        if (!form) {
            return;
        }

        const phoneDisplay = document.getElementById('quick-phone-display');
        const phoneDial = document.getElementById('quick-phone-dial');
        const emailInput = document.getElementById('quick-email');
        const hoursEn = document.getElementById('quick-hours-en');
        const hoursAr = document.getElementById('quick-hours-ar');
        const hoursKu = document.getElementById('quick-hours-ku');
        const monFri = document.getElementById('quick-hours-monfri');
        const sat = document.getElementById('quick-hours-sat');
        const sun = document.getElementById('quick-hours-sun');
        const socialWhatsapp = document.getElementById('quick-social-whatsapp');
        const socialInstagram = document.getElementById('quick-social-instagram');
        const socialFacebook = document.getElementById('quick-social-facebook');
        const reloadBtn = document.getElementById('quick-business-reload');

        if (!phoneDisplay || !phoneDial || !emailInput || !hoursEn || !hoursAr || !hoursKu || !monFri || !sat || !sun || !socialWhatsapp || !socialInstagram || !socialFacebook || !reloadBtn) {
            return;
        }

        populateQuickBusinessForm = function () {
            const phoneEn = extractLinkedLine(getEffectiveContentValue('en', 'contact.phone'));
            const phoneAr = extractLinkedLine(getEffectiveContentValue('ar', 'contact.phone'));
            const phoneKu = extractLinkedLine(getEffectiveContentValue('ku', 'contact.phone'));
            const emailEn = extractLinkedLine(getEffectiveContentValue('en', 'contact.email'));

            phoneDisplay.value = phoneEn.text || phoneAr.text || phoneKu.text || '';
            phoneDial.value = (phoneEn.href || '').replace(/^tel:/i, '');
            emailInput.value = (emailEn.href || '').replace(/^mailto:/i, '');

            hoursEn.value = phoneEn.tail || '';
            hoursAr.value = phoneAr.tail || '';
            hoursKu.value = phoneKu.tail || '';

            monFri.value = getEffectiveContentValue('en', 'appointments.monFriHours') || '';
            sat.value = getEffectiveContentValue('en', 'appointments.saturdayHours') || '';
            sun.value = getEffectiveContentValue('en', 'appointments.sundayHours') || '';

            socialWhatsapp.value = buttonOverrides.social_whatsapp?.href || '';
            socialInstagram.value = buttonOverrides.social_instagram?.href || '';
            socialFacebook.value = buttonOverrides.social_facebook?.href || '';
        };

        reloadBtn.addEventListener('click', () => {
            if (typeof populateQuickBusinessForm === 'function') {
                populateQuickBusinessForm();
                setMessage('Quick setup values reloaded.', false);
            }
        });

        form.addEventListener('submit', async (event) => {
            event.preventDefault();

            const display = phoneDisplay.value.trim();
            const dialRaw = phoneDial.value.trim();
            const supportEmail = emailInput.value.trim().toLowerCase();
            const cleanDial = dialRaw.replace(/[^\d+]/g, '');

            if (!display || !cleanDial || !isValidEmail(supportEmail)) {
                setMessage('Enter a valid phone display, dial value, and support email.', true);
                return;
            }

            const phoneByLang = {
                en: hoursEn.value.trim(),
                ar: hoursAr.value.trim(),
                ku: hoursKu.value.trim()
            };

            const socialCandidates = {
                social_whatsapp: socialWhatsapp.value.trim(),
                social_instagram: socialInstagram.value.trim(),
                social_facebook: socialFacebook.value.trim()
            };

            const defaultEmailTailByLang = {
                en: 'General & Medical Inquiries',
                ar: 'استفسارات عامة وطبية',
                ku: 'پرس و پەیوەندی پزیشکی'
            };

            const callTextByLang = {
                en: 'Call ' + display,
                ar: 'اتصل ' + display,
                ku: 'پەیوەندی بکە ' + display
            };

            try {
                await Promise.all(LANGUAGE_OPTIONS.map(async (lang) => {
                    const existingEmail = extractLinkedLine(getEffectiveContentValue(lang.code, 'contact.email'));
                    const emailTail = existingEmail.tail || defaultEmailTailByLang[lang.code] || '';
                    const phoneTail = phoneByLang[lang.code] || extractLinkedLine(getEffectiveContentValue(lang.code, 'contact.phone')).tail || '';

                    const nextPhone = '<a href="tel:' + escapeHtml(cleanDial) + '" class="text-soft-blue hover:text-fresh-green underline">' + escapeHtml(display) + '</a><br/>' + escapeHtml(phoneTail);
                    const nextEmail = '<a href="mailto:' + escapeHtml(supportEmail) + '" class="text-soft-blue hover:text-fresh-green underline">' + escapeHtml(supportEmail) + '</a><br/>' + escapeHtml(emailTail);

                    await saveContentValue(lang.code, 'contact.phone', nextPhone);
                    await saveContentValue(lang.code, 'contact.email', nextEmail);
                    await saveContentValue(lang.code, 'home.callUs', callTextByLang[lang.code] || callTextByLang.en);
                    await saveContentValue(lang.code, 'appointments.monFriHours', monFri.value.trim());
                    await saveContentValue(lang.code, 'appointments.saturdayHours', sat.value.trim());
                    await saveContentValue(lang.code, 'appointments.sundayHours', sun.value.trim());
                }));

                buttonOverrides.cta_call = {
                    href: 'tel:' + cleanDial,
                    new_tab: false
                };

                Object.entries(socialCandidates).forEach(([key, raw]) => {
                    const safeHref = sanitizePathOrUrl(raw);
                    if (!safeHref) {
                        delete buttonOverrides[key];
                        return;
                    }

                    buttonOverrides[key] = {
                        href: safeHref,
                        new_tab: true
                    };
                });

                const { error: linkError } = await upsertSiteSetting('button_overrides', buttonOverrides);
                if (linkError) {
                    throw linkError;
                }

                await loadOverrides();
                await loadMediaSettings();

                if (typeof populateQuickBusinessForm === 'function') {
                    populateQuickBusinessForm();
                }

                setMessage('Quick business setup saved successfully.', false);
            } catch (error) {
                setMessage('Failed to save quick business setup.', true);
            }
        });
    }

    async function loadOverrides() {
        const { data, error } = await client
            .from('content_overrides')
            .select('lang, i18n_key, value')
            .order('lang', { ascending: true });

        if (error) {
            return;
        }

        const rows = data || [];
        contentOverrideRows = rows;
        setContentOverrideLookup(rows);

        const container = document.getElementById('overrides-list');
        container.innerHTML = rows.map((row) => {
            const safeLang = escapeHtml(row.lang);
            const safeKey = escapeHtml(row.i18n_key);
            const safeValue = escapeHtml(row.value);
            return '<div class="border border-slate-200 rounded p-3"><div class="flex items-start justify-between gap-2"><div><p class="font-semibold text-sm">[' + safeLang + '] ' + safeKey + '</p><p class="text-sm text-slate-700 break-all">' + safeValue + '</p></div><button class="delete-override px-2 py-1 rounded bg-red-600 text-white text-xs" data-lang="' + safeLang + '" data-key="' + safeKey + '">Delete</button></div></div>';
        }).join('');

        updateOperationsMetrics({ overrides: rows.length });

        const overview = document.getElementById('content-overview');
        if (overview) {
            const sectionData = buildSectionStats();
            overview.textContent = sectionData.overrideCount + ' saved overrides';
        }

        if (typeof renderContentStudio === 'function') {
            renderContentStudio();
        }

        container.querySelectorAll('.delete-override').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const lang = btn.dataset.lang;
                const key = btn.dataset.key;
                const { error: removeError } = await client
                    .from('content_overrides')
                    .delete()
                    .eq('lang', lang)
                    .eq('i18n_key', key);

                if (removeError) {
                    setMessage('Failed to delete override.', true);
                    return;
                }
                loadOverrides();
                setMessage('Override removed.', false);
            });
        });
    }

    function initThemeForm() {
        document.getElementById('theme-form').addEventListener('submit', async (event) => {
            event.preventDefault();
            const value = {
                primary: document.getElementById('theme-primary').value,
                accent: document.getElementById('theme-accent').value,
                background: document.getElementById('theme-background').value,
                surface: document.getElementById('theme-surface').value,
                text: document.getElementById('theme-text').value
            };

            const { error } = await client
                .from('site_settings')
                .upsert({ key: 'theme', value: value }, { onConflict: 'key' });

            if (error) {
                setMessage('Failed to save theme.', true);
                return;
            }
            setMessage('Theme saved.', false);
        });

        document.getElementById('sections-form').addEventListener('submit', async (event) => {
            event.preventDefault();
            const value = {
                home: document.getElementById('section-home').checked,
                services: document.getElementById('section-services').checked,
                appointments: document.getElementById('section-appointments').checked,
                contact: document.getElementById('section-contact').checked
            };

            const { error } = await client
                .from('site_settings')
                .upsert({ key: 'sections_visibility', value: value }, { onConflict: 'key' });

            if (error) {
                setMessage('Failed to save section visibility.', true);
                return;
            }
            setMessage('Section visibility saved.', false);
        });
    }

    async function loadThemeAndSections() {
        const { data: themeData } = await client
            .from('site_settings')
            .select('value')
            .eq('key', 'theme')
            .maybeSingle();
        if (themeData?.value) {
            document.getElementById('theme-primary').value = themeData.value.primary || '#2D6A4F';
            document.getElementById('theme-accent').value = themeData.value.accent || '#4895EF';
            document.getElementById('theme-background').value = themeData.value.background || '#F8FAFC';
            document.getElementById('theme-surface').value = themeData.value.surface || '#FFFFFF';
            document.getElementById('theme-text').value = themeData.value.text || '#0d1c2e';
        }

        const { data: sectionData } = await client
            .from('site_settings')
            .select('value')
            .eq('key', 'sections_visibility')
            .maybeSingle();
        if (sectionData?.value) {
            document.getElementById('section-home').checked = sectionData.value.home !== false;
            document.getElementById('section-services').checked = sectionData.value.services !== false;
            document.getElementById('section-appointments').checked = sectionData.value.appointments !== false;
            document.getElementById('section-contact').checked = sectionData.value.contact !== false;
        }
    }

    async function getSiteSetting(key) {
        const { data, error } = await client
            .from('site_settings')
            .select('value')
            .eq('key', key)
            .maybeSingle();

        if (error || !data?.value || typeof data.value !== 'object') {
            return {};
        }

        return data.value;
    }

    async function upsertSiteSetting(key, value) {
        return client
            .from('site_settings')
            .upsert({ key: key, value: value }, { onConflict: 'key' });
    }

    function renderImageOverrides() {
        const container = document.getElementById('image-overrides-list');
        const entries = Object.entries(imageOverrides);

        if (!entries.length) {
            container.innerHTML = '<p class="text-sm text-slate-500">No image overrides saved yet.</p>';
            return;
        }

        container.innerHTML = entries.map(([key, value]) => {
            return '<div class="border border-slate-200 rounded p-3"><p class="font-semibold text-sm">' + escapeHtml(key) + '</p><p class="text-sm text-slate-700 break-all">' + escapeHtml(value) + '</p></div>';
        }).join('');
    }

    function renderButtonOverrides() {
        const container = document.getElementById('button-overrides-list');
        const entries = Object.entries(buttonOverrides);

        if (!entries.length) {
            container.innerHTML = '<p class="text-sm text-slate-500">No button overrides saved yet.</p>';
            return;
        }

        container.innerHTML = entries.map(([key, value]) => {
            const href = value?.href || '';
            const newTab = value?.new_tab === true ? 'Yes' : 'No';
            return '<div class="border border-slate-200 rounded p-3"><p class="font-semibold text-sm">' + escapeHtml(key) + '</p><p class="text-sm text-slate-700 break-all">Href: ' + escapeHtml(href) + '</p><p class="text-xs text-slate-500">Open in new tab: ' + newTab + '</p></div>';
        }).join('');
    }

    async function loadMediaSettings() {
        imageOverrides = await getSiteSetting('image_overrides');
        buttonOverrides = await getSiteSetting('button_overrides');
        renderImageOverrides();
        renderButtonOverrides();

        if (typeof renderImageStudio === 'function') {
            renderImageStudio();
        }
    }

    function initMediaManager() {
        const imageSearch = document.getElementById('image-search');
        const imageEditor = document.getElementById('image-editor');
        const imageOverview = document.getElementById('image-overview');
        const imageKey = document.getElementById('image-key');
        const imageUrl = document.getElementById('image-url');
        const buttonKey = document.getElementById('button-key');
        const buttonHref = document.getElementById('button-href');
        const buttonNewTab = document.getElementById('button-new-tab');

        if (!imageSearch || !imageEditor || !imageOverview || !imageKey || !imageUrl || !buttonKey || !buttonHref || !buttonNewTab) {
            return;
        }

        if (mediaStudioInitialized && typeof renderImageStudio === 'function') {
            renderImageStudio();
            return;
        }

        mediaStudioInitialized = true;

        imageKey.innerHTML = IMAGE_KEYS.map((item) => '<option value="' + item.key + '">' + item.label + '</option>').join('');
        buttonKey.innerHTML = BUTTON_KEYS.map((item) => '<option value="' + item.key + '">' + item.label + '</option>').join('');

        renderImageStudio = function () {
            const query = imageSearchQuery.trim().toLowerCase();
            const grouped = getGroupedImageKeys();
            const groups = Object.keys(grouped);

            imageOverview.textContent = IMAGE_KEYS.length + ' image slots';

            imageEditor.innerHTML = groups.map((groupName) => {
                const items = grouped[groupName].filter((item) => {
                    const fullText = [item.key, item.label, getCurrentImageValue(item.key)].join(' ').toLowerCase();
                    return matchesSearch(fullText, query);
                });

                const cards = items.map((item) => {
                    const currentValue = getCurrentImageValue(item.key);
                    const safeCurrent = escapeHtml(currentValue);
                    const safeDefault = escapeHtml(getDefaultImageValue(item.key));
                    const previewId = 'image-preview-' + item.key;
                    const cardId = 'image-card-' + item.key;

                    return [
                        '<article class="glass p-4 image-card" id="' + cardId + '" data-image-key="' + escapeHtml(item.key) + '">',
                        '<div class="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-3">',
                        '<div>',
                        '<p class="text-xs uppercase tracking-[0.18em] text-slate-500">' + escapeHtml(groupName) + '</p>',
                        '<h4 class="text-2xl mb-0">' + escapeHtml(item.label) + '</h4>',
                        '<p class="text-xs text-slate-500 mt-1">' + escapeHtml(item.key) + '</p>',
                        '</div>',
                        '<div class="flex flex-wrap gap-2">',
                        '<button type="button" class="btn-primary" data-image-action="save" data-image-key="' + escapeHtml(item.key) + '">Save Image</button>',
                        '<button type="button" class="btn-ghost" data-image-action="load" data-image-key="' + escapeHtml(item.key) + '">Load Current</button>',
                        '<button type="button" class="btn-danger" data-image-action="delete" data-image-key="' + escapeHtml(item.key) + '">Delete</button>',
                        '</div>',
                        '</div>',
                        '<div class="grid grid-cols-1 lg:grid-cols-[1.2fr_.8fr] gap-4 mt-4">',
                        '<div>',
                        '<label class="block text-sm font-semibold text-slate-700 mb-2">Image URL or path</label>',
                        '<input type="text" class="image-value-input w-full" data-image-input="' + escapeHtml(item.key) + '" value="' + safeCurrent + '" placeholder="https://... or assets/images/..." />',
                        '<p class="text-xs text-slate-500 mt-2">Default: ' + safeDefault + '</p>',
                        '</div>',
                        '<div class="rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 min-h-40">',
                        '<img id="' + previewId + '" data-image-preview="' + escapeHtml(item.key) + '" src="' + safeCurrent + '" alt="Preview for ' + escapeHtml(item.label) + '" class="w-full h-full object-cover aspect-[4/3]" loading="lazy" />',
                        '</div>',
                        '</div>',
                        '</article>'
                    ].join('');
                }).join('');

                return [
                    '<section class="space-y-3">',
                    '<h3 class="text-3xl mb-0">' + escapeHtml(groupName) + '</h3>',
                    '<div class="space-y-3">' + cards + '</div>',
                    '</section>'
                ].join('');
            }).join('');
        };

        renderImageStudio();

        imageSearch.addEventListener('input', () => {
            imageSearchQuery = imageSearch.value;
            renderImageStudio();
        });

        imageEditor.addEventListener('input', (event) => {
            const input = event.target.closest('[data-image-input]');
            if (!input) {
                return;
            }

            const key = input.dataset.imageInput;
            const preview = imageEditor.querySelector('[data-image-preview="' + CSS.escape(key) + '"]');
            if (preview) {
                const candidate = sanitizePathOrUrl(input.value) || getDefaultImageValue(key);
                preview.src = candidate;
            }
        });

        imageEditor.addEventListener('click', async (event) => {
            const button = event.target.closest('[data-image-action]');
            if (!button || !imageEditor.contains(button)) {
                return;
            }

            const key = button.dataset.imageKey;
            const input = imageEditor.querySelector('[data-image-input="' + CSS.escape(key) + '"]');
            if (!input) {
                return;
            }

            if (button.dataset.imageAction === 'load') {
                input.value = getCurrentImageValue(key);
                const preview = imageEditor.querySelector('[data-image-preview="' + CSS.escape(key) + '"]');
                if (preview) {
                    preview.src = getCurrentImageValue(key);
                }
                setMessage('Loaded current image value for ' + humanizeKey(key) + '.', false);
                return;
            }

            if (button.dataset.imageAction === 'delete') {
                delete imageOverrides[key];
                const { error } = await upsertSiteSetting('image_overrides', imageOverrides);
                if (error) {
                    setMessage('Failed to delete image override.', true);
                    return;
                }
                renderImageOverrides();
                renderImageStudio();
                setMessage('Image override removed.', false);
                return;
            }

            const safeUrl = sanitizePathOrUrl(input.value);
            if (!safeUrl) {
                setMessage('Invalid image URL/path. Use https://, /, #, or a local path.', true);
                return;
            }

            imageOverrides[key] = safeUrl;
            const { error } = await upsertSiteSetting('image_overrides', imageOverrides);
            if (error) {
                setMessage('Failed to save image override.', true);
                return;
            }

            renderImageOverrides();
            renderImageStudio();
            setMessage('Image override saved for ' + humanizeKey(key) + '.', false);
        });

        document.getElementById('load-image-value').addEventListener('click', () => {
            imageUrl.value = imageOverrides[imageKey.value] || '';
        });

        document.getElementById('delete-image-value').addEventListener('click', async () => {
            delete imageOverrides[imageKey.value];
            const { error } = await upsertSiteSetting('image_overrides', imageOverrides);
            if (error) {
                setMessage('Failed to delete image override.', true);
                return;
            }
            imageUrl.value = '';
            renderImageOverrides();
            setMessage('Image override removed.', false);
        });

        document.getElementById('image-form').addEventListener('submit', async (event) => {
            event.preventDefault();
            const safeUrl = sanitizePathOrUrl(imageUrl.value);
            if (!safeUrl) {
                setMessage('Invalid image URL/path. Use https://, /, #, or a local path.', true);
                return;
            }

            imageOverrides[imageKey.value] = safeUrl;
            const { error } = await upsertSiteSetting('image_overrides', imageOverrides);
            if (error) {
                setMessage('Failed to save image override.', true);
                return;
            }

            renderImageOverrides();
            setMessage('Image override saved.', false);
        });

        document.getElementById('load-button-value').addEventListener('click', () => {
            const current = buttonOverrides[buttonKey.value] || {};
            buttonHref.value = current.href || '';
            buttonNewTab.checked = current.new_tab === true;
        });

        document.getElementById('delete-button-value').addEventListener('click', async () => {
            delete buttonOverrides[buttonKey.value];
            const { error } = await upsertSiteSetting('button_overrides', buttonOverrides);
            if (error) {
                setMessage('Failed to delete button override.', true);
                return;
            }
            buttonHref.value = '';
            buttonNewTab.checked = false;
            renderButtonOverrides();
            setMessage('Button override removed.', false);
        });

        document.getElementById('button-form').addEventListener('submit', async (event) => {
            event.preventDefault();
            const safeHref = sanitizePathOrUrl(buttonHref.value);
            if (!safeHref) {
                setMessage('Invalid button href. Use #anchor, /path, https://, or local path.', true);
                return;
            }

            buttonOverrides[buttonKey.value] = {
                href: safeHref,
                new_tab: buttonNewTab.checked
            };

            const { error } = await upsertSiteSetting('button_overrides', buttonOverrides);
            if (error) {
                setMessage('Failed to save button override.', true);
                return;
            }

            renderButtonOverrides();
            setMessage('Button override saved.', false);
        });
    }

    async function loadAdmins() {
        let result = await client
            .from('admin_profiles')
            .select('user_id, role, created_at')
            .order('created_at', { ascending: false });

        // Backward compatibility for projects where created_at was not added yet.
        if (result.error && String(result.error.message || '').toLowerCase().includes('created_at')) {
            result = await client
                .from('admin_profiles')
                .select('user_id, role')
                .order('user_id', { ascending: true });
        }

        if (result.error) {
            setMessage('Failed to load admins list.', true);
            return;
        }

        const container = document.getElementById('admins-list');
        const rows = result.data || [];
        container.innerHTML = rows.map((admin) => {
            return '<div class="border border-slate-200 rounded p-3"><p class="font-semibold text-sm">' + escapeHtml(admin.user_id) + '</p><p class="text-sm text-slate-600">Role: ' + escapeHtml(admin.role) + '</p></div>';
        }).join('');

        updateOperationsMetrics({ admins: rows.length });
    }

    function initAdminInvite() {
        const form = document.getElementById('invite-admin-form');
        if (!form) {
            return;
        }

        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const email = document.getElementById('new-admin-email').value.trim();
            const password = document.getElementById('new-admin-password').value;
            const role = document.getElementById('new-admin-role').value;

            if (!isValidEmail(email)) {
                setMessage('Please enter a valid admin email.', true);
                return;
            }

            if (password.length < 10) {
                setMessage('Password must be at least 10 characters.', true);
                return;
            }

            const response = await fetch(cfg.functionsBaseUrl + '/invite-admin', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ email: email, password: password, role: role })
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                setMessage(payload.error || 'Failed to create admin.', true);
                return;
            }

            setMessage('Admin created successfully.', false);
            form.reset();
            loadAdmins();
        });
    }

    async function initializePanel() {
        initTabs();
        initContentEditor();
        initQuickBusinessManager();
        initThemeForm();
        initMediaManager();
        initAdminInvite();

        document.getElementById('refresh-appointments').addEventListener('click', loadAppointments);
        const refreshMessages = document.getElementById('refresh-messages');
        if (refreshMessages) {
            refreshMessages.addEventListener('click', loadMessages);
        }

        await Promise.all([
            loadAppointments(),
            loadMessages(),
            loadOverrides(),
            loadThemeAndSections(),
            loadMediaSettings(),
            loadAdmins()
        ]);

        if (typeof populateQuickBusinessForm === 'function') {
            populateQuickBusinessForm();
        }
    }

    function bindAuth() {
        document.getElementById('login-form').addEventListener('submit', async (event) => {
            event.preventDefault();
            const email = document.getElementById('login-email').value.trim();
            const password = document.getElementById('login-password').value;

            const { error } = await client.auth.signInWithPassword({ email: email, password: password });
            if (error) {
                authMessage.textContent = error.message;
                return;
            }

            authMessage.textContent = '';
            const ok = await requireAdmin();
            if (ok) {
                initializePanel();
            }
        });

        logoutBtn.addEventListener('click', async () => {
            await client.auth.signOut();
            location.reload();
        });
    }

    async function boot() {
        if (window.location.protocol === 'file:') {
            authMessage.textContent = 'Open this page through a local server, not file://. Use your dev URL, for example http://localhost:5173/admin.html';
            return;
        }

        if (!cfg || !cfg.url || !cfg.anonKey || !supabaseLib) {
            authMessage.textContent = 'Supabase config is missing. Update supabase-config.js first.';
            return;
        }

        client = supabaseLib.createClient(cfg.url, cfg.anonKey);
        bindAuth();

        const ok = await requireAdmin();
        if (ok) {
            initializePanel();
        }
    }

    boot();
})();

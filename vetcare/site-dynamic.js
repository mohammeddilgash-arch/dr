(function () {
    const cfg = window.VETCARE_SUPABASE;
    const supabaseLib = window.supabase;

    if (!cfg || !cfg.url || !cfg.anonKey || !supabaseLib) {
        return;
    }

    const client = supabaseLib.createClient(cfg.url, cfg.anonKey);
    const publicClient = supabaseLib.createClient(cfg.url, cfg.anonKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
        }
    });

    const IMAGE_SELECTOR_MAP = {
        hero_slider_1: '[data-image-id="hero_slider_1"]',
        hero_slider_2: '[data-image-id="hero_slider_2"]',
        hero_slider_3: '[data-image-id="hero_slider_3"]',
        hero_slider_4: '[data-image-id="hero_slider_4"]',
        gallery_horse: '[data-image-id="gallery_horse"]',
        gallery_dog: '[data-image-id="gallery_dog"]',
        gallery_chicken: '[data-image-id="gallery_chicken"]',
        gallery_cow: '[data-image-id="gallery_cow"]',
        gallery_cat: '[data-image-id="gallery_cat"]',
        gallery_sheep: '[data-image-id="gallery_sheep"]',
        services_vet: '[data-image-id="services_vet"]'
    };

    let imageDefaults = null;

    const BUTTON_SELECTOR_MAP = {
        nav_book_appointment: '[data-button-id="nav_book_appointment"]',
        mobile_nav_book_appointment: '[data-button-id="mobile_nav_book_appointment"]',
        hero_schedule_visit: '[data-button-id="hero_schedule_visit"]',
        hero_view_services: '[data-button-id="hero_view_services"]',
        home_view_all_services: '[data-button-id="home_view_all_services"]',
        cta_book_visit: '[data-button-id="cta_book_visit"]',
        cta_call: '[data-button-id="cta_call"]',
        social_whatsapp: '[data-button-id="social_whatsapp"]',
        social_instagram: '[data-button-id="social_instagram"]',
        social_facebook: '[data-button-id="social_facebook"]'
    };

    const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const MAX_LEN = {
        fullName: 120,
        email: 180,
        phone: 40,
        petName: 120,
        message: 2000
    };

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

    function extractBackgroundUrl(backgroundImage) {
        if (typeof backgroundImage !== 'string') {
            return '';
        }

        const match = backgroundImage.match(/url\((['"]?)(.*?)\1\)/i);
        return match?.[2] || '';
    }

    function getImageDefaults() {
        if (imageDefaults) {
            return imageDefaults;
        }

        imageDefaults = Object.entries(IMAGE_SELECTOR_MAP).reduce((acc, [key, selector]) => {
            const element = document.querySelector(selector);
            if (!element) {
                return acc;
            }

            if (element.tagName === 'IMG') {
                const src = element.getAttribute('src') || '';
                acc[key] = sanitizePathOrUrl(src) || '';
                return acc;
            }

            const inlineBg = extractBackgroundUrl(element.style.backgroundImage || '');
            const computedBg = extractBackgroundUrl(window.getComputedStyle(element).backgroundImage || '');
            const source = inlineBg || computedBg;
            acc[key] = sanitizePathOrUrl(source) || '';
            return acc;
        }, {});

        return imageDefaults;
    }

    function applyUrlToElementWithFallback(element, primaryUrl, fallbackUrl) {
        const primary = sanitizePathOrUrl(primaryUrl);
        const fallback = sanitizePathOrUrl(fallbackUrl);
        const finalPrimary = primary || fallback;

        if (!finalPrimary) {
            return;
        }

        if (element.tagName === 'IMG') {
            element.onerror = function handleImageError() {
                element.onerror = null;
                if (fallback) {
                    element.src = fallback;
                }
            };
            element.src = finalPrimary;
            return;
        }

        if (!fallback || finalPrimary === fallback) {
            element.style.backgroundImage = 'url("' + finalPrimary + '")';
            return;
        }

        const probe = new Image();
        probe.onload = function handleImageLoad() {
            element.style.backgroundImage = 'url("' + finalPrimary + '")';
        };
        probe.onerror = function handleBackgroundError() {
            element.style.backgroundImage = 'url("' + fallback + '")';
        };
        probe.src = finalPrimary;
    }

    function cleanText(value, maxLen) {
        if (typeof value !== 'string') {
            return '';
        }
        return value.trim().slice(0, maxLen);
    }

    function isValidEmail(value) {
        return EMAIL_PATTERN.test(value);
    }

    function setFormSubmitting(form, isSubmitting) {
        const submit = form?.querySelector('button[type="submit"]');
        if (!submit) {
            return;
        }
        submit.disabled = isSubmitting;
        submit.classList.toggle('opacity-70', isSubmitting);
        submit.classList.toggle('cursor-not-allowed', isSubmitting);
    }

    function isSafeI18nPath(path) {
        if (typeof path !== 'string' || !path.trim()) {
            return false;
        }

        return path.split('.').every((segment) => {
            if (!/^[A-Za-z0-9_]+$/.test(segment)) {
                return false;
            }
            return segment !== '__proto__' && segment !== 'prototype' && segment !== 'constructor';
        });
    }

    function setNestedValue(obj, path, value) {
        if (!isSafeI18nPath(path)) {
            return;
        }

        const keys = path.split('.');
        let target = obj;
        for (let i = 0; i < keys.length - 1; i += 1) {
            const key = keys[i];
            if (!target[key] || typeof target[key] !== 'object') {
                target[key] = {};
            }
            target = target[key];
        }
        target[keys[keys.length - 1]] = value;
    }

    async function loadSettingObject(key) {
        const { data, error } = await client
            .from('site_settings')
            .select('value')
            .eq('key', key)
            .maybeSingle();

        if (error || !data?.value || typeof data.value !== 'object') {
            return null;
        }

        return data.value;
    }

    async function loadContentOverrides() {
        const { data, error } = await client
            .from('content_overrides')
            .select('lang, i18n_key, value');

        if (error || !Array.isArray(data)) {
            return;
        }

        data.forEach((row) => {
            if (!window.translations?.[row.lang]) {
                return;
            }
            setNestedValue(window.translations[row.lang], row.i18n_key, row.value);
        });

        if (typeof window.translatePage === 'function') {
            window.translatePage();
        }
    }

    function applyThemeValue(theme) {
        const root = document.documentElement;
        const styleId = 'vetcare-theme-overrides';
        let styleTag = document.getElementById(styleId);
        if (!styleTag) {
            styleTag = document.createElement('style');
            styleTag.id = styleId;
            document.head.appendChild(styleTag);
        }

        const primary = theme.primary || '#2D6A4F';
        const accent = theme.accent || '#4895EF';
        const bg = theme.background || '#F8FAFC';
        const surface = theme.surface || '#FFFFFF';
        const text = theme.text || '#0d1c2e';

        root.style.setProperty('--vc-primary', primary);
        root.style.setProperty('--vc-accent', accent);
        root.style.setProperty('--vc-bg', bg);
        root.style.setProperty('--vc-surface', surface);
        root.style.setProperty('--vc-text', text);

        styleTag.textContent = [
            'body{background-color:var(--vc-bg)!important;color:var(--vc-text)!important;}',
            '.bg-fresh-green{background-color:var(--vc-primary)!important;}',
            '.text-fresh-green{color:var(--vc-primary)!important;}',
            '.bg-soft-blue{background-color:var(--vc-accent)!important;}',
            '.text-soft-blue{color:var(--vc-accent)!important;}',
            '.bg-clinical-bg{background-color:var(--vc-bg)!important;}',
            '.bg-professional-white{background-color:var(--vc-surface)!important;}'
        ].join('');
    }

    async function loadTheme() {
        const value = await loadSettingObject('theme');
        if (!value) {
            return;
        }

        applyThemeValue(value);
    }

    async function loadSectionVisibility() {
        const value = await loadSettingObject('sections_visibility');
        if (!value) {
            return;
        }

        Object.entries(value).forEach(([sectionId, visible]) => {
            const section = document.getElementById(sectionId);
            if (!section) {
                return;
            }
            section.style.display = visible === false ? 'none' : '';
        });
    }

    function applyImageOverrides(value) {
        const safeValue = value && typeof value === 'object' ? value : {};
        const defaults = getImageDefaults();

        Object.keys(IMAGE_SELECTOR_MAP).forEach((key) => {
            const selector = IMAGE_SELECTOR_MAP[key];
            if (!selector) {
                return;
            }

            const element = document.querySelector(selector);
            if (!element) {
                return;
            }

            const overrideUrl = safeValue[key];
            const defaultUrl = defaults[key] || '';
            applyUrlToElementWithFallback(element, overrideUrl, defaultUrl);
        });
    }

    async function loadImageOverrides() {
        const value = await loadSettingObject('image_overrides');
        if (!value) {
            return;
        }

        applyImageOverrides(value);
    }

    function applyButtonOverrides(value) {
        Object.entries(value).forEach(([key, config]) => {
            const selector = BUTTON_SELECTOR_MAP[key];
            if (!selector || !config || typeof config !== 'object') {
                return;
            }

            const href = sanitizePathOrUrl(config.href);
            const openInNewTab = config.new_tab === true;
            if (!href) {
                return;
            }

            const button = document.querySelector(selector);
            if (!button) {
                return;
            }

            button.setAttribute('href', href);
            if (openInNewTab) {
                button.setAttribute('target', '_blank');
                button.setAttribute('rel', 'noopener noreferrer');
            } else {
                button.removeAttribute('target');
                button.removeAttribute('rel');
            }
        });
    }

    async function loadButtonOverrides() {
        const value = await loadSettingObject('button_overrides');
        if (!value) {
            return;
        }

        applyButtonOverrides(value);
    }

    function showFeedback(elementId, message, isError) {
        const box = document.getElementById(elementId);
        if (!box) {
            return;
        }
        box.textContent = message;
        box.classList.remove('hidden', 'text-error', 'text-fresh-green');
        box.classList.add(isError ? 'text-error' : 'text-fresh-green');
    }

    function showAppointmentFeedback(message, isError) {
        showFeedback('appointment-feedback', message, isError);
    }

    function showContactFeedback(message, isError) {
        showFeedback('contact-feedback', message, isError);
    }

    function collectAppointmentPayload(form) {
        return {
            full_name: cleanText(form.querySelector('[name="full_name"]')?.value || '', MAX_LEN.fullName),
            email: cleanText(form.querySelector('[name="email"]')?.value || '', MAX_LEN.email),
            phone: cleanText(form.querySelector('[name="phone"]')?.value || '', MAX_LEN.phone),
            animal_type: form.querySelector('[name="animal_type"]')?.value || '',
            preferred_date: form.querySelector('[name="preferred_date"]')?.value || null,
            preferred_time: form.querySelector('[name="preferred_time"]')?.value || null,
            message: cleanText(form.querySelector('[name="message"]')?.value || '', MAX_LEN.message),
            lang: document.documentElement.lang || 'en',
            status: 'pending'
        };
    }

    function setupAppointmentSubmission() {
        const form = document.getElementById('appointment-form');
        if (!form) {
            return;
        }

        let isSubmitting = false;

        form.addEventListener('submit', async (event) => {
            event.preventDefault();

            if (isSubmitting) {
                return;
            }

            const payload = collectAppointmentPayload(form);
            if (!payload.full_name || !payload.email) {
                showAppointmentFeedback('Please provide your full name and email.', true);
                return;
            }

            if (!isValidEmail(payload.email)) {
                showAppointmentFeedback('Please enter a valid email address.', true);
                return;
            }

            isSubmitting = true;
            setFormSubmitting(form, true);

            try {
                const { error } = await publicClient.from('appointments').insert(payload);
                if (error) {
                    showAppointmentFeedback('Failed to send appointment request. Please try again.', true);
                    return;
                }

                showAppointmentFeedback('Appointment request submitted successfully. We will contact you soon.', false);
                form.reset();
            } catch (_error) {
                showAppointmentFeedback('Unexpected network issue. Please try again.', true);
            } finally {
                isSubmitting = false;
                setFormSubmitting(form, false);
            }
        });
    }

    function collectContactPayload(form) {
        return {
            full_name: cleanText(form.querySelector('[name="full_name"]')?.value || '', MAX_LEN.fullName),
            email: cleanText(form.querySelector('[name="email"]')?.value || '', MAX_LEN.email),
            pet_name: cleanText(form.querySelector('[name="pet_name"]')?.value || '', MAX_LEN.petName),
            service_inquiry: form.querySelector('[name="service_inquiry"]')?.value || '',
            message: cleanText(form.querySelector('[name="message"]')?.value || '', MAX_LEN.message),
            lang: document.documentElement.lang || 'en',
            status: 'new'
        };
    }

    function setupContactSubmission() {
        const form = document.getElementById('contact-form');
        if (!form) {
            return;
        }

        let isSubmitting = false;

        form.addEventListener('submit', async (event) => {
            event.preventDefault();

            if (isSubmitting) {
                return;
            }

            const payload = collectContactPayload(form);
            if (!payload.full_name || !payload.email || !payload.message) {
                showContactFeedback('Please provide your name, email, and message.', true);
                return;
            }

            if (!isValidEmail(payload.email)) {
                showContactFeedback('Please enter a valid email address.', true);
                return;
            }

            isSubmitting = true;
            setFormSubmitting(form, true);

            try {
                const { error } = await publicClient
                    .from('contact_messages')
                    .insert(payload);
                if (error) {
                    showContactFeedback('Failed to send message. Please try again.', true);
                    return;
                }

                if (cfg.functionsBaseUrl) {
                    fetch(cfg.functionsBaseUrl + '/contact-message-notify', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            message_id: null,
                            full_name: payload.full_name,
                            email: payload.email,
                            pet_name: payload.pet_name,
                            service_inquiry: payload.service_inquiry,
                            message: payload.message,
                            lang: payload.lang
                        }),
                        keepalive: true
                    }).catch(() => null);
                }

                showContactFeedback('Message sent successfully. We will get back to you soon.', false);
                form.reset();
            } catch (_error) {
                showContactFeedback('Unexpected network issue. Please try again.', true);
            } finally {
                isSubmitting = false;
                setFormSubmitting(form, false);
            }
        });
    }

    async function boot() {
        const startupTasks = [
            loadTheme(),
            loadSectionVisibility(),
            loadImageOverrides(),
            loadButtonOverrides(),
            loadContentOverrides()
        ];

        await Promise.allSettled(startupTasks);
        setupAppointmentSubmission();
        setupContactSubmission();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();

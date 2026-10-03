"use strict";

/* ==========================================================================
   QLOBAL TEMA MODULU — Tünd/Gündüz Rejimi (.clinerules §4)
   --------------------------------------------------------------------------
   Məqsəd: "Tənzimləmələr"də seçilmiş tema BÜTÜN səhifələrdə (exam,
   exam-hall, analytics, tutor-dashboard, auth, index, terms, privacy)
   eyni anda tətbiq olunsun.

   TƏHLÜKƏSİZLİK (Zero-Trust):
   - Burada HƏR GÜN açar, token və ya server ünvanı YOXDUR; yalnız UI vəziyyəti.
   - localStorage-a yazılan dəyər "light" | "dark" whitelist-inə keçirilir;
     istifadəçi tərəfdən zərərli dəyər (məs. `"><script>`) yazılsa belə
     DOM-a yalnız sanitasiya olunmuş dəyər ötürülür və innerHTML YOXDUR.
   - Səhifə dəyişəni (data-theme) yalnız iki sabit dəyər ala bilər.

   FOUC (Flash of Unstyled Content) QORUMASI:
   - Bu fayl <head> daxilində `defer` OLMADAN (sinxron) yüklənir; beləliklə
     <body> çəkilməzdən əvvəl data-theme tətbiq olunur və səhifə "bir an"
     ağ görünmür.
   ========================================================================== */

(function () {
    const STORAGE_KEY = "theme";
    const LIGHT = "light";
    const DARK = "dark";
    const VALID_THEMES = [LIGHT, DARK];

    /* Yalnız iki icazəli dəyər — istənilən hər gələn məlumat bundan keçir */
    function sanitizeTheme(value) {
        return VALID_THEMES.indexOf(value) !== -1 ? value : LIGHT;
    }

    function readStoredTheme() {
        try {
            return sanitizeTheme(window.localStorage.getItem(STORAGE_KEY));
        } catch (_) {
            /* localStorage bloklanıbsa (private mode / kuki siyasəti) → açıq rejim */
            return LIGHT;
        }
    }

    function persistTheme(theme) {
        try {
            window.localStorage.setItem(STORAGE_KEY, theme);
        } catch (_) {
            /* Yazma mümkün deyilsə tema yalnız bu səhifə üçün qalır */
        }
    }

    /* Səhifədəki bütün tema toggle-lərini (checkbox) yenilədir.
       Hazırda exam.html-də `theme-toggle-checkbox` id-si var; gələcəkdə
       digər səhifələrə eyni klass/toggle əlavə olunanda avtomatik sinxron olur. */
    function syncToggles(theme) {
        const toggles = document.querySelectorAll(
            "#theme-toggle-checkbox, .theme-toggle-checkbox, [data-theme-toggle]"
        );
        toggles.forEach((toggle) => {
            if (toggle.type === "checkbox") {
                toggle.checked = theme === DARK;
            }
            toggle.setAttribute("aria-checked", theme === DARK ? "true" : "false");
        });
    }

    function applyTheme(theme, persist) {
        const safeTheme = sanitizeTheme(theme);
        document.documentElement.setAttribute("data-theme", safeTheme);

        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) {
            meta.setAttribute("content", safeTheme === DARK ? "#0F172A" : "#F8FAFC");
        }

        syncToggles(safeTheme);

        if (persist) {
            persistTheme(safeTheme);
        }

        return safeTheme;
    }

    /* 1) İLK TƏTBİQ — səhifə çəkilməzdən əvvəl (FOUC olmaz) */
    applyTheme(readStoredTheme(), false);

    /* 2) Digər səhifədə/tabda tema dəyişəndə bu səhifə də yenilənir */
    window.addEventListener("storage", (event) => {
        if (event.key === STORAGE_KEY) {
            applyTheme(event.newValue, false);
        }
    });

    /* 3) Toggle hadisələri — DOM yükləndikdən sonra bağlanır */
    document.addEventListener("DOMContentLoaded", () => {
        syncToggles(readStoredTheme());

        const toggles = document.querySelectorAll(
            "#theme-toggle-checkbox, .theme-toggle-checkbox, [data-theme-toggle]"
        );
        toggles.forEach((toggle) => {
            toggle.addEventListener("change", () => {
                applyTheme(toggle.checked ? DARK : LIGHT, true);
            });
        });
    });

    /* 4) İdarəetmə API-si — digər modullar (js/exam.js və s.) bundan istifadə edir */
    window.GradientTheme = {
        get: () => document.documentElement.getAttribute("data-theme") || LIGHT,
        isDark: () => document.documentElement.getAttribute("data-theme") === DARK,
        set: (theme) => applyTheme(theme, true),
        toggle: () =>
            applyTheme(
                document.documentElement.getAttribute("data-theme") === DARK ? LIGHT : DARK,
                true
            ),
    };
})();
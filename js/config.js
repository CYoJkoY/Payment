// Values are injected per page by the build (window.__PAGE_CONFIG__), so the
// same JavaScript bundle serves every user's page.
const runtime = (typeof window !== 'undefined' && window.__PAGE_CONFIG__) || {};

export const CONFIG = {
    kofiLink: runtime.kofiLink || "https://ko-fi.com/yoko4012",
    pageUrl: runtime.pageUrl || (typeof location !== 'undefined' ? location.href : ''),
    modalAnimationDelay: 200,
    feedbackDuration: 2000
};

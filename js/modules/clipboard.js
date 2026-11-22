import { CONFIG } from '../config.js';

function bindCopy(buttonId, feedbackId, resolveValue, messages) {
    const button = document.getElementById(buttonId);
    const feedback = document.getElementById(feedbackId);

    if (!button || !feedback) return;

    const restore = () => {
        feedback.textContent = messages.success;
        feedback.style.color = '';
    };

    button.addEventListener('click', () => {
        navigator.clipboard.writeText(resolveValue()).then(() => {
            feedback.textContent = messages.success;
            feedback.classList.add('show');
            setTimeout(() => {
                feedback.classList.remove('show');
            }, CONFIG.feedbackDuration);
        }).catch(err => {
            console.error('Failed to copy:', err);
            feedback.textContent = messages.failure;
            feedback.style.color = '#ff5e5b';
            feedback.classList.add('show');
            setTimeout(() => {
                feedback.classList.remove('show');
                restore();
            }, CONFIG.feedbackDuration);
        });
    });
}

export function initClipboard() {
    bindCopy('copy-btn', 'copy-feedback', () => CONFIG.kofiLink, {
        success: 'Copied to clipboard!',
        failure: 'Copy failed'
    });

    bindCopy('copy-page-btn', 'copy-page-feedback', () => CONFIG.pageUrl, {
        success: '已复制页面链接',
        failure: '复制失败'
    });
}

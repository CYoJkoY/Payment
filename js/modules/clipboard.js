import { CONFIG } from '../config.js';

export function initClipboard() {
    const copyBtn = document.getElementById('copy-btn');
    const copyFeedback = document.getElementById('copy-feedback');

    if (!copyBtn || !copyFeedback) return;

    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(CONFIG.kofiLink).then(() => {
            copyFeedback.classList.add('show');
            setTimeout(() => { 
                copyFeedback.classList.remove('show'); 
            }, CONFIG.feedbackDuration);
        }).catch(err => {
            console.error('Failed to copy link:', err);
            copyFeedback.textContent = 'Copy failed';
            copyFeedback.style.color = '#ff5e5b';
            copyFeedback.classList.add('show');
            setTimeout(() => { 
                copyFeedback.classList.remove('show'); 
                copyFeedback.textContent = 'Copied to clipboard!';
                copyFeedback.style.color = '';
            }, CONFIG.feedbackDuration);
        });
    });
}

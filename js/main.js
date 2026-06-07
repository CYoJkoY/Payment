import { initSpotlight } from './modules/spotlight.js';
import { initModal } from './modules/modal.js';
import { initClipboard } from './modules/clipboard.js';
import { initScrollReveal } from './modules/scrollReveal.js';

document.addEventListener('DOMContentLoaded', () => {
    // 按顺序初始化各模块
    initSpotlight();
    initModal();
    initClipboard();
    initScrollReveal();
    
    console.log('All modules initialized successfully.');
});

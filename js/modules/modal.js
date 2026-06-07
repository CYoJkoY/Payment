import { CONFIG } from '../config.js';

export function initModal() {
    const modal = document.getElementById('qr-modal');
    const modalImg = document.getElementById('modal-img');

    const openModal = (imgId) => {
        const sourceImg = document.getElementById(imgId);
        if (sourceImg && modal) {
            modalImg.src = sourceImg.src;
            modal.classList.add('active');
            modal.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
        }
    };

    const closeModal = () => {
        if (!modal) return;
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        setTimeout(() => { modalImg.src = ''; }, CONFIG.modalAnimationDelay); 
    };

    // 绑定事件
    document.querySelectorAll('.qr-container').forEach(container => {
        container.addEventListener('click', () => {
            const targetId = container.getAttribute('data-modal-target');
            if (targetId) openModal(targetId);
        });
    });

    if (modal) {
        modal.addEventListener('click', closeModal);
    }

    // 键盘无障碍支持 (ESC 关闭)
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && modal && modal.classList.contains('active')) {
            closeModal();
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    // 1. DOM 元素缓存 (提升查询性能)
    const modal = document.getElementById('qr-modal');
    const modalImg = document.getElementById('modal-img');
    const copyBtn = document.getElementById('copy-btn');
    const copyFeedback = document.getElementById('copy-feedback');
    const kofiLink = "https://ko-fi.com/yoko4012";

    // 2. 模态框逻辑
    const openModal = (imgId) => {
        const sourceImg = document.getElementById(imgId);
        if (sourceImg) {
            modalImg.src = sourceImg.src;
            modal.classList.add('active');
            modal.setAttribute('aria-hidden', 'false');
        }
    };

    const closeModal = () => {
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        // 延迟清空 src，避免关闭动画期间出现闪烁
        setTimeout(() => { modalImg.src = ''; }, 200); 
    };

    // 使用事件委托处理所有二维码点击
    document.querySelectorAll('.qr-container').forEach(container => {
        container.addEventListener('click', () => {
            const targetId = container.getAttribute('data-modal-target');
            if (targetId) openModal(targetId);
        });
    });

    // 点击模态框任意位置（包括图片本身）均触发关闭，符合 zoom-out 的直觉
    modal.addEventListener('click', closeModal);

    // 3. 复制功能逻辑
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(kofiLink).then(() => {
                copyFeedback.style.opacity = '1';
                setTimeout(() => { copyFeedback.style.opacity = '0'; }, 2000);
            }).catch(err => {
                console.error('Failed to copy link:', err);
            });
        });
    }

    // 4. 键盘无障碍支持 (ESC 关闭)
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && modal.classList.contains('active')) {
            closeModal();
        }
    });
});

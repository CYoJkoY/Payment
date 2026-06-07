document.addEventListener('DOMContentLoaded', () => {
    // 1. DOM 元素缓存
    const modal = document.getElementById('qr-modal');
    const modalImg = document.getElementById('modal-img');
    const copyBtn = document.getElementById('copy-btn');
    const copyFeedback = document.getElementById('copy-feedback');
    const kofiLink = "https://ko-fi.com/yoko4012";

    // 2. 聚光灯效果 (Spotlight Effect)
    // 通过更新 CSS 变量驱动径向渐变，避免繁重的 JS 重绘，保持 60fps
    const cards = document.querySelectorAll('.card');
    cards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            card.style.setProperty('--mouse-x', `${x}px`);
            card.style.setProperty('--mouse-y', `${y}px`);
        });
    });

    // 3. 模态框逻辑 (含背景滚动锁定)
    const openModal = (imgId) => {
        const sourceImg = document.getElementById(imgId);
        if (sourceImg) {
            modalImg.src = sourceImg.src;
            modal.classList.add('active');
            modal.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden'; // 锁定背景滚动
        }
    };

    const closeModal = () => {
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = ''; // 恢复背景滚动
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

    // 点击模态框任意位置触发关闭
    modal.addEventListener('click', closeModal);

    // 4. 复制功能逻辑 (增强型平滑反馈)
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(kofiLink).then(() => {
                copyFeedback.classList.add('show');
                setTimeout(() => { 
                    copyFeedback.classList.remove('show'); 
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy link:', err);
                copyFeedback.textContent = 'Copy failed';
                copyFeedback.style.color = '#ff5e5b';
                copyFeedback.classList.add('show');
                setTimeout(() => { 
                    copyFeedback.classList.remove('show'); 
                    copyFeedback.textContent = 'Copied to clipboard!';
                    copyFeedback.style.color = '';
                }, 2000);
            });
        });
    }

    // 5. 键盘无障碍支持 (ESC 关闭)
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && modal.classList.contains('active')) {
            closeModal();
        }
    });

    // 6. 平滑滚动入场动画 (Scroll Reveal)
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px' // 提前 50px 触发，体验更平滑
    };

    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                revealObserver.unobserve(entry.target); // 动画仅触发一次，节省性能
            }
        });
    }, observerOptions);

    document.querySelectorAll('.reveal').forEach(el => {
        revealObserver.observe(el);
    });
});

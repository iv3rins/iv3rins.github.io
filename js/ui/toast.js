/**
 * Toast — Neo-Brutalism 提示 (V12)
 * 用法: Toast.show(text, type)  // type: 'info'|'error'|'success'
 */
const TOAST_CONTAINER = 'toast-container';

export const Toast = {
    show(message, type = 'info') {
        const container = document.getElementById(TOAST_CONTAINER);
        if (!container) return;

        // ★ V12: 移除旧提示，杜绝堆叠
        container.querySelectorAll('.toast-item, .toast').forEach(t => t.remove());

        const el = document.createElement('div');
        el.className = `toast-item toast-${type}`;
        el.textContent = message;
        container.appendChild(el);

        // 3s 后自动销毁
        setTimeout(() => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(-10px)';
            setTimeout(() => el.remove(), 300);
        }, 3000);
    }
};

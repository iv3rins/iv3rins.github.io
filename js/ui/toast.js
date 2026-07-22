/**
 * Toast — 轻量级消息提示，替代所有 alert()
 * 用法: Toast.show(text, type)  // type: 'info'|'error'|'success'
 */
const TOAST_CONTAINER = 'toast-container';

export const Toast = {
    show(message, type = 'info') {
        const container = document.getElementById(TOAST_CONTAINER);
        if (!container) return console.warn('Toast container not found');

        const el = document.createElement('div');
        el.className = `toast toast-${type}`;
        el.textContent = message;
        container.appendChild(el);

        // 入场动画触发
        requestAnimationFrame(() => el.classList.add('in'));

        // 2.5s 后自动销毁
        setTimeout(() => {
            el.classList.remove('in');
            el.classList.add('out');
            setTimeout(() => el.remove(), 300);
        }, 2500);
    }
};

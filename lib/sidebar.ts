// The desktop sidebar can be tucked away (components/shell/sidebar-toggle.tsx). The choice is kept per
// browser in localStorage and applied as <html data-sidebar="collapsed"> by SIDEBAR_INIT_SCRIPT before the
// first paint, so the static, prerendered frame never flashes open first. A first visit has no stored value
// and gets the sidebar open.

export const SIDEBAR_STORAGE_KEY = "trackwise.sidebar";

/** Runs inline in <head> (app/layout.tsx) before the body paints. */
export const SIDEBAR_INIT_SCRIPT = `try{if(localStorage.getItem(${JSON.stringify(SIDEBAR_STORAGE_KEY)})==="collapsed")document.documentElement.dataset.sidebar="collapsed"}catch(e){}`;

import { useEffect, useRef } from 'react';
export default function Dialog({ children, label, onClose }) {
  const ref=useRef();
  useEffect(()=>{const previous=document.activeElement;const root=ref.current;const oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';root.querySelector('button')?.focus();
    const handle=event=>{if(event.key==='Escape'){event.preventDefault();onClose();}if(event.key==='Tab'){const elements=[...root.querySelectorAll('button:not(:disabled),a[href],input,select,textarea,[tabindex="0"]')];const first=elements[0],last=elements.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}};root.addEventListener('keydown',handle);return()=>{root.removeEventListener('keydown',handle);document.body.style.overflow=oldOverflow;previous?.focus();};},[onClose]);
  return <div className="modal-overlay" onClick={onClose}><section ref={ref} role="dialog" aria-modal="true" aria-label={label} className="modal recipe-modal" onClick={e=>e.stopPropagation()}>{children}</section></div>;
}

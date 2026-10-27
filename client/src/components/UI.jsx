import { ArrowRight, LoaderCircle, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
export function PageTitle({ eyebrow, title, description, action }) { return <header className="page-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="subtitle">{description}</p>}</div>{action}</header>; }
export function Loading({ label = 'Loading your space…' }) { return <div className="loading-state" role="status"><LoaderCircle className="spin" size={24} /><span>{label}</span></div>; }
export function Empty({ title, description, to, label }) { return <div className="empty-state"><div className="empty-icon"><Sparkles size={26} /></div><h2>{title}</h2><p>{description}</p>{to && <Link className="button primary" to={to}>{label}<ArrowRight size={16} /></Link>}</div>; }
export function ErrorState({ message, retry }) { return <div className="notice error" role="alert"><span>{message}</span>{retry && <button className="text-button" onClick={retry}>Try again</button>}</div>; }
export function Field({ label, children, hint }) { return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
export function Submit({ busy, children, ...props }) { return <button className="button primary" disabled={busy} {...props}>{busy && <LoaderCircle className="spin" size={17} />}{children}</button>; }
export function Skeletons() { return <div className="skeleton-list" role="status" aria-label="Preparing your recipe"><div className="skeleton large" /><div className="skeleton" /><div className="skeleton" /><div className="skeleton short" /></div>; }

import { Link } from 'react-router-dom';
import { Leaf, ArrowLeft } from 'lucide-react';
export default function NotFound(){return <main className="not-found" id="main-content"><Leaf size={46}/><p className="eyebrow">404 · A LITTLE OFF THE PATH</p><h1>Let’s find your way back.</h1><p>This page isn’t part of the plan.</p><Link className="button primary" to="/"><ArrowLeft size={17}/>Back to home</Link></main>}

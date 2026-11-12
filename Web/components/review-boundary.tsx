"use client";
import {useState,type ReactNode} from 'react';
export function ReviewBoundary({children}:{children:ReactNode}) {
  const [message,setMessage]=useState('');
  return <div onClickCapture={e=>{const a=(e.target as HTMLElement).closest('a');if(!a)return;const url=new URL(a.href,location.href);if(url.origin!==location.origin){e.preventDefault();e.stopPropagation();return;}if(url.pathname==='/'){e.preventDefault();e.stopPropagation();location.href='/review'+url.search+url.hash;}else if(url.pathname!== '/review' && !a.getAttribute('href')?.startsWith('#')){e.preventDefault();e.stopPropagation();setMessage('This action needs the authenticated owner workflow. This preview uses synthetic data only.');}}}
    onSubmitCapture={e=>{const action=(e.target as HTMLFormElement).getAttribute('action');if(action?.startsWith('/api/')){e.preventDefault();e.stopPropagation();setMessage('Owner access and approval changes are disabled in this synthetic preview.');}}}>
    {children}{message&&<div className="review-message" role="status">{message}<button onClick={()=>setMessage('')}>Dismiss</button></div>}
  </div>;
}

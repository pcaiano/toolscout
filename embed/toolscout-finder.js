(()=>{
  const current=document.currentScript;if(!current)return;
  const host=location.hostname||'embed';
  const root=document.createElement('form');
  root.setAttribute('data-toolscout-embed','finder');
  root.style.cssText='font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:620px;border:1px solid #252b33;border-radius:18px;padding:18px;background:#0b0d10;color:#f5f7fa;box-sizing:border-box';
  root.innerHTML='<div style="font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#98a2b3;font-weight:800">ToolScout Finder</div><div style="font-size:24px;letter-spacing:-.03em;font-weight:850;margin:7px 0 5px">Find the right tool. Faster.</div><div style="font-size:13px;line-height:1.5;color:#c7ced8;margin-bottom:12px">Describe the job you need software to do. ToolScout will narrow the market to a focused shortlist.</div><div style="display:flex;gap:8px;flex-wrap:wrap"><input name="q" required maxlength="180" placeholder="e.g. automate client follow-up" style="flex:1;min-width:220px;border:1px solid #3a424d;border-radius:11px;padding:11px 12px;background:#14181d;color:#f5f7fa;font:inherit"><button type="submit" style="border:0;border-radius:11px;padding:11px 14px;background:#f5f7fa;color:#101318;font-weight:850;cursor:pointer">Find tools ↗</button></div><div style="margin-top:12px;font-size:10px;color:#667085">Powered by ToolScout · independent software recommendations</div>';
  root.addEventListener('submit',e=>{e.preventDefault();const q=new FormData(root).get('q')||'';const qs=new URLSearchParams({q:String(q),utm_source:host,utm_medium:'distribution',utm_campaign:'embed_finder',utm_content:'finder'});window.open('https://trytoolscout.org/?'+qs.toString(),'_blank','noopener');});
  current.insertAdjacentElement('afterend',root);
})();

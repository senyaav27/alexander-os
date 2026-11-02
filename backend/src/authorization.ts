import { timingSafeEqual } from 'node:crypto';
export function secretMatches(actual:unknown,expected:string|undefined) {
  if(typeof actual!=='string'||!expected) return false;
  const a=Buffer.from(actual),b=Buffer.from(expected);
  return a.length===b.length && timingSafeEqual(a,b);
}
export function authorizedMessage(body:any, allowed:string|undefined) {
  const m=body?.message;
  if(!allowed || !Number.isSafeInteger(body?.update_id) || body.update_id<0 ||
    !Number.isSafeInteger(m?.from?.id) || String(m.from.id)!==allowed || m.from.is_bot ||
    !Number.isSafeInteger(m?.chat?.id) || m?.chat?.type!=='private' || String(m.chat.id)!==allowed ||
    typeof m?.text!=='string' || !m.text.trim() || m.text.length>2000) return null;
  return {updateId:body.update_id as number,text:m.text.trim() as string};
}

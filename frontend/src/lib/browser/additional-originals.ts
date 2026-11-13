/**
 * Initial-event supplementary originals. The primary event is created exactly
 * once; each subsequent original is an independent evidence-only POST.
 * Nothing here changes or re-runs SERA, narrative, risk or P/O/A.
 */
export const MAX_EVENT_ORIGINALS = 5
export const MAX_ADDITIONAL_ORIGINAL_BYTES = 3_800_000
export type AdditionalOriginalStatus =
  'queued' | 'uploading' | 'saved' | 'unverified' | 'error'
export type AdditionalOriginal = {
  id: string
  file: File
  status: AdditionalOriginalStatus
  message: string
}
export function queueAdditionalOriginals(
  current: AdditionalOriginal[],
  incoming: File[],
  availableSlots: number,
): {entries: AdditionalOriginal[];rejected: string[]} {
  const max = Math.max(0,Math.min(MAX_EVENT_ORIGINALS,availableSlots))
  const accepted = current.slice()
  const rejected: string[] = []
  for (const file of incoming) {
    if (accepted.length >= max) {
      rejected.push('O evento aceita no máximo cinco originais, incluindo a fonte principal.')
    } else if (!Number.isSafeInteger(file.size) || file.size < 1 ||
      file.size > MAX_ADDITIONAL_ORIGINAL_BYTES ||
      !/\.(pdf|docx|txt|png|jpe?g|webp)$/i.test(file.name)) {
      rejected.push('Original inválido: ' + file.name.slice(0,90) +
        ' (PDF/DOCX/TXT/PNG/JPEG/WebP, máximo 3,8 MB).')
    } else {
      accepted.push({id:crypto.randomUUID(),file,status:'queued',message:'Aguardando registro'})
    }
  }
  return {entries:accepted,rejected}
}

export type AppendReport = {success:boolean;createdOrPresent:number;failed:number;unverified:number}
export async function appendAdditionalOriginals(params:{
  eventId:string
  accessToken:string
  originals:AdditionalOriginal[]
  onStatus:(id:string,status:AdditionalOriginalStatus,message:string)=>void
  fetcher?:typeof fetch
}):Promise<AppendReport> {
  const {eventId,accessToken,originals,onStatus,fetcher=fetch}=params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId) ||
      !accessToken) throw new Error('Identificação do evento ou autenticação inválida.')
  let createdOrPresent=0,failed=0,unverified=0
  for (const item of originals) {
    if(item.status==='saved') continue
    if(item.status==='unverified'){ unverified++;continue }
    onStatus(item.id,'uploading','Registrando o original...')
    try {
      const fd=new FormData()
      fd.set('file',item.file)
      const response=await fetcher('/api/events/'+eventId+'/documents',{
        method:'POST',
        headers:{Authorization:'Bearer '+accessToken},
        body:fd,redirect:'error',cache:'no-store',
      })
      const result:unknown=await response.json()
      // The acknowledgement must correspond to the exact uploaded bytes, not
      // just a successful HTTP code or an unrelated indexed source.
      const hashBytes=await crypto.subtle.digest('SHA-256',await item.file.arrayBuffer())
      const localSha=Array.from(new Uint8Array(hashBytes),x=>x.toString(16).padStart(2,'0')).join('')
      const reportedSha=typeof result==='object' && result!==null && 'sha256' in result
        ? result.sha256 : null
      const status=typeof result==='object'&&result!==null&&
        'status' in result ? result.status : null
      if (((response.status===201&&status==='created') ||
           (response.status===200&&status==='already_present')) &&
          reportedSha===localSha) {
        onStatus(item.id,'saved',status==='created'?
          'Original preservado. Sem extração automática.':
          'Original já registrado, sem duplicidade.')
        createdOrPresent++
      } else if(response.status===202&&status==='audit_unverified') {
        onStatus(item.id,'unverified',
          'Original indexado, mas auditoria não confirmada. Verifique no evento.')
        unverified++
      } else {
        throw new Error('HTTP '+response.status)
      }
    } catch {
      failed++
      onStatus(item.id,'error','Envio não confirmado. Retente sem duplicar o evento.')
    }
  }
  return {success:failed===0&&unverified===0,createdOrPresent,failed,unverified}
}

import { NextResponse } from 'next/server'
import { getOrCreateRequestId } from '@/lib/observability/request-id'
import { writeAuditLog } from '@/lib/observability/audit'
import { EventAttachmentError } from '@/lib/server/event-attachment'
import {
  AppendDocumentError, appendOriginalEventDocument,
  readBoundedDocumentAppendForm,
} from '@/lib/server/event-document-append'
import { requireBearerUser } from '@/lib/server/api-auth'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import {
  DocumentAccessError, listEventDocumentManifest,
} from '@/lib/server/event-document-access'

export async function GET(req: Request, ctx: {params: Promise<{eventId:string}>}) {
  try {
    const user = await requireBearerUser(req)
    const { eventId } = await ctx.params
    const items = await listEventDocumentManifest(getSupabaseAdmin(), user.tenantId, eventId)
    return NextResponse.json({ documents: items }, {
      headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
    })
  } catch (error) {
    if (error instanceof Response) return error
    const status = error instanceof DocumentAccessError ?
      error.code === 'NOT_FOUND' ? 404 : error.code === 'INVALID_ID' ? 400 : 503 : 503
    return NextResponse.json(
      { detail: status === 404 ? 'Evento não encontrado.' : status === 400 ?
        'Identificador inválido.' : 'Não foi possível consultar os anexos.' },
      { status, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}


/**
 * Supplementary evidence only. Uploads remain independent of the SERA engine,
 * and one new PDF/DOCX is accepted per request to respect Vercel payload cap.
 */
export async function POST(req: Request, ctx: {params: Promise<{eventId:string}>}) {
  const requestId = getOrCreateRequestId(req)
  const respond = (detail:string,status:number,extras:Record<string,unknown>={}) =>
    NextResponse.json({detail,...extras},{status,headers:{
      'Cache-Control':'no-store','x-request-id':requestId,
    }})
  try {
    const user = await requireBearerUser(req)
    if (!['admin','analyst'].includes(String(user.role).toLowerCase())) {
      return respond('Apenas analistas e administradores podem anexar evidências.',403)
    }
    const {eventId} = await ctx.params
    const form = await readBoundedDocumentAppendForm(req)
    if (form.getAll('file').length !== 1 || [...form.keys()].some((key)=>key!=='file')) {
      return respond('Envie um único arquivo PDF ou DOCX por requisição.',400)
    }
    const file = form.get('file')
    if (!(file instanceof File) || file.size===0) {
      return respond('Arquivo ausente ou vazio.',400)
    }
    const result = await appendOriginalEventDocument({
      admin:getSupabaseAdmin(), tenantId:user.tenantId, eventId,
      authUserId:user.authUserId, publicUserId:user.publicUserId, file,
    })
    if (result.status==='created') {
      try {
        await writeAuditLog({
          tenantId:user.tenantId,userId:user.authUserId,requestId,
          eventType:'event_document_attached',entityType:'event',entityId:eventId,
          route:'/api/events/[eventId]/documents',method:'POST',
          metadata:{source_ordinal:result.sourceOrdinal,sha256:result.sha256},
        })
      } catch {
        console.error('[document append] critical audit unavailable after persistence',{requestId,eventId})
        return respond('O documento foi indexado, mas a auditoria não pôde ser confirmada. Verifique o evento antes de reenviar.',
          202,{status:'audit_unverified',sourceOrdinal:result.sourceOrdinal,
            sha256:result.sha256,analysisChanged:false})
      }
    }
    return NextResponse.json({
      status:result.status, sourceOrdinal:result.sourceOrdinal,sha256:result.sha256,
      extractionStatus:'NOT_EXTRACTED',analysisChanged:false,
    },{
      status:result.status==='created'?201:200,
      headers:{'Cache-Control':'no-store','x-request-id':requestId},
    })
  } catch (error) {
    if (error instanceof Response) return error
    if (error instanceof DocumentAccessError) {
      return respond(error.code==='NOT_FOUND'?'Evento não encontrado.':
        error.code==='INVALID_ID'?'Evento inválido.':
        'Não foi possível verificar o evento.',
        error.code==='NOT_FOUND'?404:error.code==='INVALID_ID'?400:503)
    }
    if (error instanceof EventAttachmentError) {
      return respond(error.code==='BODY_TOO_LARGE'?
        'O limite total da requisição é 4 MB.':
        error.code==='INVALID_TYPE'?'PDF ou DOCX inválido.':
        'Formulário ou arquivo inválido.',
        error.code==='BODY_TOO_LARGE'?413:400)
    }
    if (error instanceof AppendDocumentError) {
      const status = error.code==='UPLOAD_TOO_LARGE'?413:
        error.code==='LIMIT_REACHED'?409:
        error.code==='INVALID_UPLOAD'?400:503
      return respond(status===413?'Cada arquivo adicional pode ter até 3,8 MB.':
        status===409?'O evento atingiu o limite de fontes ou tamanho total.':
        status===400?'Arquivo inválido.':
        'Não foi possível confirmar a persistência deste documento. Não há sucesso implícito.',
        status,{code:error.code})
    }
    console.error('[document append] unexpected error',{requestId,
      errorType:error instanceof Error?error.name:typeof error})
    return respond('Não foi possível anexar a evidência.',503)
  }
}

import {NextResponse} from 'next/server'
import {requireBearerUser} from '@/lib/server/api-auth'
import {getSupabaseAdmin} from '@/lib/server/supabase-admin'
import {DocumentAccessError} from '@/lib/server/event-document-access'
import {getOrCreateRequestId} from '@/lib/observability/request-id'
import {
  OcrReviewStoreError,readOcrReviewBody,storeAuthorizedOcrReview,
  listAuthorizedOcrReviews,
} from '@/lib/server/event-document-ocr-review'

type Params={params:Promise<{eventId:string;documentId:string}>}
const common={'Cache-Control':'private, no-store',
  'X-Content-Type-Options':'nosniff','Vary':'Authorization'}
function errorResponse(error:unknown,requestId:string){
  if(error instanceof Response)return error
  const code=error instanceof DocumentAccessError?error.code:
    error instanceof OcrReviewStoreError?error.code:'STORE_UNAVAILABLE'
  const status=code==='NOT_FOUND'?404:code==='INVALID_ID'||code==='INVALID_BODY'?400:
    code==='TOO_LARGE'?413:code==='SOURCE_CHANGED'||code==='INTEGRITY_MISMATCH'?409:
    code==='TOO_MANY_REVIEWS'?429:code==='REVIEW_NOT_AVAILABLE'?422:503
  if(status===503)console.error('[OCR review] unavailable',{
    requestId,errorType:error instanceof Error?error.name:typeof error,
  })
  return NextResponse.json({code,message:status===503?
    'Registro de revisão indisponível; nenhum sucesso foi confirmado.':
    status===429?'Limite de dez revisões por hora atingido.':
    status===409?'Original alterado ou integridade não confirmada.':
    status===404?'Fonte não encontrada.':'Requisição de revisão inválida.'},
    {status,headers:{...common,'x-request-id':requestId}})
}
export async function POST(req:Request,ctx:Params){
  const requestId=getOrCreateRequestId(req)
  try{
    const user=await requireBearerUser(req)
    if(!['admin','analyst'].includes(String(user.role).toLowerCase()))
      return NextResponse.json({code:'FORBIDDEN'},{
        status:403,headers:{...common,'x-request-id':requestId}})
    const {eventId,documentId}=await ctx.params
    const payload=await readOcrReviewBody(req)
    const result=await storeAuthorizedOcrReview({
      admin:getSupabaseAdmin(),tenantId:user.tenantId,
      eventId,documentId,publicUserId:user.publicUserId,
      authUserId:user.authUserId,
    },payload)
    return NextResponse.json({
      ...result,reviewedByHuman:'AUTHENTICATED_SELF_DECLARATION',
      scientificallyValidated:false,analysisChanged:false,
    },{status:result.status==='created'?201:200,
      headers:{...common,'x-request-id':requestId}})
  }catch(error){return errorResponse(error,requestId)}
}
export async function GET(req:Request,ctx:Params){
  const requestId=getOrCreateRequestId(req)
  try{
    const user=await requireBearerUser(req)
    if(!['admin','analyst'].includes(String(user.role).toLowerCase()))
      return NextResponse.json({code:'FORBIDDEN'},{
        status:403,headers:{...common,'x-request-id':requestId}})
    const {eventId,documentId}=await ctx.params
    const result=await listAuthorizedOcrReviews({
      admin:getSupabaseAdmin(),tenantId:user.tenantId,
      eventId,documentId,publicUserId:user.publicUserId,
      authUserId:user.authUserId,
    })
    return NextResponse.json({reviews:result,analysisChanged:false},{
      headers:{...common,'x-request-id':requestId}})
  }catch(error){return errorResponse(error,requestId)}
}

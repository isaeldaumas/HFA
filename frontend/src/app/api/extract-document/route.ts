import { NextResponse } from 'next/server'
import { selectMultipartFiles } from '@/lib/gemini-multifile-form'
import { requireBearerUser } from '@/lib/server/api-auth'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import {
  processBatchFiles,
  extractSingleFile,
} from '@/lib/gemini-multifile-extractor'
import {
  MAX_BATCH_FILE_COUNT,
  MAX_TOTAL_BATCH_BYTES,
} from '@/lib/gemini-multifile-types'

const UPLOADS_PER_HOUR = 10

export async function POST(req: Request) {
  try {
    const user = await requireBearerUser(req)
    const admin = getSupabaseAdmin()

    const ct = req.headers.get('content-type') || ''
    if (!ct.includes('multipart/form-data')) {
      return NextResponse.json(
        { detail: 'Use multipart/form-data com campo "file" ou "files"' },
        { status: 400 }
      )
    }

    const form = await req.formData()

    // Do not count the legacy alias twice when multipart contains both.
    const formFiles = selectMultipartFiles(form)
    const rawFilesList = form.getAll('files')

    if (formFiles.length === 0) {
      return NextResponse.json(
        { error: 'NO_FILE', detail: 'Nenhum arquivo enviado no campo "file" ou "files"' },
        { status: 400 }
      )
    }

    // Verificacao explicita de limite de quantidade e tamanho total do lote
    if (formFiles.length > MAX_BATCH_FILE_COUNT) {
      return NextResponse.json(
        {
          error: 'BATCH_LIMIT_EXCEEDED',
          message: `Limite excedido: maximo de ${MAX_BATCH_FILE_COUNT} arquivos por envio (enviados: ${formFiles.length}).`,
        },
        { status: 400 }
      )
    }

    const totalBytes = formFiles.reduce((acc, f) => acc + f.size, 0)
    if (totalBytes > MAX_TOTAL_BATCH_BYTES) {
      return NextResponse.json(
        {
          error: 'BATCH_TOO_LARGE',
          message: `Tamanho total do lote ultrapassa 30MB (${(totalBytes / (1024 * 1024)).toFixed(1)}MB). Reduza o tamanho ou numero de arquivos.`,
        },
        { status: 400 }
      )
    }

    // Verificacao de rate limit (por cota horaria)
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count, error: cErr } = await admin
      .from('sera_document_uploads')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.userId)
      .gte('created_at', since)

    if (cErr) {
      console.warn('upload rate count:', cErr.message)
    } else if ((count ?? 0) + formFiles.length > UPLOADS_PER_HOUR) {
      return NextResponse.json(
        {
          error: 'RATE_LIMIT',
          message: `Limite de uploads atingido: maximo de ${UPLOADS_PER_HOUR} arquivos por hora. Voce ja enviou ${count ?? 0} na ultima hora.`,
        },
        { status: 400 }
      )
    }

    // Prepara buffers
    const preparedFiles = await Promise.all(
      formFiles.map(async (file) => ({
        name: file.name,
        size: file.size,
        buffer: Buffer.from(await file.arrayBuffer()),
        declaredMime: file.type,
      }))
    )

    // Se for apenas 1 arquivo e veio do fluxo legado (somente 'file'), preserva compatibilidade estrita
    const isSingleLegacyRequest = formFiles.length === 1 && rawFilesList.length === 0
    if (isSingleLegacyRequest) {
      const singleResult = await extractSingleFile(preparedFiles[0])
      if (singleResult.status === 'invalid_type' || singleResult.status === 'mime_spoofing') {
        return NextResponse.json(
          { error: 'INVALID_TYPE', message: singleResult.warningOrError || 'Apenas arquivos suportados sao aceitos' },
          { status: 400 }
        )
      }
      if (singleResult.status === 'too_large') {
        return NextResponse.json(
          { error: 'TOO_LARGE', message: singleResult.warningOrError || 'O arquivo nao pode ultrapassar 10MB' },
          { status: 400 }
        )
      }
      if (singleResult.status === 'password_protected') {
        return NextResponse.json(
          { error: 'PDF_PASSWORD', message: singleResult.warningOrError },
          { status: 400 }
        )
      }
      if (singleResult.status === 'corrupt') {
        return NextResponse.json(
          { error: 'PDF_NO_TEXT', message: singleResult.warningOrError },
          { status: 400 }
        )
      }
      if (singleResult.status === 'parse_failed') {
        return NextResponse.json(
          { error: 'PARSE_FAILED', message: singleResult.warningOrError },
          { status: 400 }
        )
      }

      // Registra rate limit
      await admin.from('sera_document_uploads').insert({ user_id: user.userId })

      return NextResponse.json({
        text: singleResult.text,
        wordCount: singleResult.wordCount,
        fileName: singleResult.originalName,
        sanitizedName: singleResult.sanitizedName,
        sha256: singleResult.sha256,
        status: singleResult.status,
        warningOrError: singleResult.warningOrError,
        isOcrPending: singleResult.isOcrPending || false,
        files: [singleResult],
        totalFiles: 1,
        successfulExtractions: singleResult.status === 'extracted' ? 1 : 0,
      })
    }

    // Fluxo multi-arquivo (ou multi-file request)
    const { manifest, batchError } = await processBatchFiles(preparedFiles)
    if (batchError || !manifest) {
      return NextResponse.json({ error: 'BATCH_ERROR', message: batchError }, { status: 400 })
    }

    // Se todos os arquivos falharam com erro critico (nenhum extraido nem anexo visual valido)
    if (manifest.successfulExtractions === 0 && manifest.unsupportedOcrCount === 0) {
      const firstError = manifest.items[0]?.warningOrError || 'Falha ao processar os arquivos enviados.'
      return NextResponse.json(
        {
          error: 'BATCH_PROCESSING_FAILED',
          message: firstError,
          manifest,
        },
        { status: 400 }
      )
    }

    // Registra rate limit no banco para os arquivos processados
    const inserts = formFiles.map(() => ({ user_id: user.userId }))
    if (inserts.length > 0) {
      await admin.from('sera_document_uploads').insert(inserts)
    }

    return NextResponse.json({
      text: manifest.combinedText,
      wordCount: manifest.totalWordCount,
      fileName: manifest.items.map((i) => i.sanitizedName).join(', '),
      files: manifest.items,
      totalFiles: manifest.totalFiles,
      successfulExtractions: manifest.successfulExtractions,
      unsupportedOcrCount: manifest.unsupportedOcrCount,
      failedFilesCount: manifest.failedFilesCount,
      manifest,
    })
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[extract-document Error]', e)
    return NextResponse.json(
      {
        error: 'PARSE_FAILED',
        message: 'Nao foi possivel ler o arquivo. Verifique se ele esta corrompido.',
      },
      { status: 400 }
    )
  }
}

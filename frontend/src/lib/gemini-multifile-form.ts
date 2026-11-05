/**
 * Select exactly one wire format. The modern "files" field takes precedence;
 * do not append the legacy "file" alias to the same batch.
 *
 * Multipart parsers create distinct File objects for repeated parts, so
 * reference-equality deduplication (includes/file === firstFile) is unsafe.
 */
export function selectMultipartFiles(form: FormData): File[] {
  const modern = form.getAll('files').filter((entry): entry is File => entry instanceof File)
  if (modern.length > 0) return modern
  return form.getAll('file').filter((entry): entry is File => entry instanceof File)
}

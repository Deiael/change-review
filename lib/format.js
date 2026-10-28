function statusLine(item) {
  const counts = item.status === 'pending' ? ` +${item.added}/-${item.removed}` : ''
  const created = item.created ? ' (new file)' : ''
  const reason = item.reason ? ` [${item.reason}]` : ''
  return `- ${item.status}${counts}${created}${reason}: ${item.path}`
}

export function formatList(result) {
  const lines = [
    `Change review (${result.sessionId})`,
    `pending ${result.pending} · accepted ${result.accepted} · reverted ${result.reverted} · skipped ${result.skipped}`,
  ]
  if (!result.items.length) {
    lines.push('No matching file changes.')
    return lines.join('\n')
  }
  lines.push('')
  for (const item of result.items) lines.push(statusLine(item))
  lines.push('')
  lines.push('Use change_review_show with a path to see the unified diff.')
  lines.push('Use change_review_accept or change_review_revert to dispose of a pending file.')
  return lines.join('\n')
}

export function formatShow(result) {
  if (!result.ok) return `Change review: ${result.error}`
  const header = [
    `path: ${result.item.path}`,
    `status: ${result.item.status}`,
    `created: ${result.item.created}`,
    `+${result.item.added}/-${result.item.removed}`,
  ]
  if (result.item.comments?.length) {
    header.push('comments:')
    for (const comment of result.item.comments) header.push(`  - ${comment.at}: ${comment.text}`)
  }
  return `${header.join('\n')}\n\n${result.diff || '(no textual diff)'}`
}

export function formatAction(result, verb) {
  if (!result.ok) return `Change review ${verb} failed: ${result.error}`
  return `Change review ${verb} ok: ${statusLine(result.item)}`
}

export function formatComment(result) {
  if (!result.ok) return `Change review comment failed: ${result.error}`
  const latest = result.item.comments.at(-1)
  return [
    `Recorded review comment on ${result.item.path}.`,
    `Latest comment: ${latest?.text ?? ''}`,
    'Treat this as human review feedback for that file. Adjust the file if the comment asks for a change, then leave the new edit pending.',
  ].join('\n')
}

/** Makes `%`, `_` and `\` in user input match literally inside a LIKE/ILIKE pattern. */
function escapeLike(term) {
  return term.replace(/[\\%_]/g, '\\$&');
}

module.exports = { escapeLike };

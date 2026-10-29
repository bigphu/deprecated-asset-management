/**
 * page / pageSize of an offset/limit list (ADR-0003), shared by the list DTOs. MAX_PAGE keeps OFFSET far
 * inside bigint range: a larger page would be a PostgreSQL 500 rather than a 422.
 */

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const MAX_PAGE = 1_000_000;

function readPaging(c) {
  return {
    page: c.integer('page', { min: 1, max: MAX_PAGE, fallback: 1 }),
    pageSize: c.integer('pageSize', { min: 1, max: MAX_PAGE_SIZE, fallback: DEFAULT_PAGE_SIZE }),
  };
}

module.exports = { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MAX_PAGE, readPaging };

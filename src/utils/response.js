/**
 * Single response shape for the whole API:
 *   { success, message, data, meta }
 * The frontend `api` helper unwraps `data`, so pages get plain objects.
 */
const success = (res, { statusCode = 200, message = 'Success', data = null, meta = null } = {}) =>
  res.status(statusCode).json({ success: true, message, data, meta });

const created = (res, data, message = 'Created successfully') =>
  success(res, { statusCode: 201, message, data });

/** Paginated list — `meta.pagination` is what the UI reads for page controls. */
const paginated = (res, { items, page, limit, total, message = 'Success' }) =>
  success(res, {
    message,
    data: items,
    meta: {
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
    },
  });

module.exports = { success, created, paginated };

/**
 * Shared bcrypt pre-save hook for any account model that stores a password.
 * Keeps SuperAdmin / TenantAdmin / User in lock-step on hashing rules — same
 * work factor, same `comparePassword` helper, same idempotency on `.save()`
 * when the password isn't dirty.
 */
import bcrypt from 'bcryptjs';

export const PASSWORD_WORK_FACTOR = 12;

export function applyPasswordHook(schema) {
  schema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    try {
      const salt = await bcrypt.genSalt(PASSWORD_WORK_FACTOR);
      this.password = await bcrypt.hash(this.password, salt);
      next();
    } catch (err) {
      next(err);
    }
  });

  schema.methods.comparePassword = async function (candidate) {
    return bcrypt.compare(candidate, this.password);
  };
}

import 'package:blocks_app/data/models/payout_models.dart';

enum BankField { holderName, accountNumber, confirmAccountNumber, ifsc }

enum BankFieldError { required, invalid, mismatch }

/// Format checks for the "add bank account" form: instant feedback only.
///
/// They cannot tell whether an account exists or belongs to the holder. The
/// bank does that, through the payout provider, on the server.
abstract final class BankAccountValidator {
  static final _ifsc = RegExp(r'^[A-Z]{4}0[A-Z0-9]{6}$');
  // \p{M}: vowel signs and viramas, which Hindi and Telugu names need.
  static final _holder = RegExp(
    r"^\p{L}[\p{L}\p{M}\s.'\-]{1,59}$",
    unicode: true,
  );

  static String normalizeIfsc(String input) =>
      input.replaceAll(RegExp(r'\s'), '').toUpperCase();

  static String digitsOnly(String input) => input.replaceAll(RegExp(r'\D'), '');

  static bool isValidIfsc(String input) => _ifsc.hasMatch(normalizeIfsc(input));

  /// 9-18 digits, and not one repeated digit (`111111111`).
  static bool isValidAccountNumber(String input) {
    final compact = input.replaceAll(RegExp(r'[\s\-]'), '');
    if (!RegExp(r'^\d+$').hasMatch(compact)) return false;
    if (compact.length < 9 || compact.length > 18) return false;
    return compact.split('').toSet().length > 1;
  }

  static bool isValidHolderName(String input) =>
      _holder.hasMatch(input.trim().replaceAll(RegExp(r'\s+'), ' '));

  static Map<BankField, BankFieldError> validate(BankAccountInput i) {
    final errors = <BankField, BankFieldError>{};
    if (i.holderName.trim().isEmpty) {
      errors[BankField.holderName] = BankFieldError.required;
    } else if (!isValidHolderName(i.holderName)) {
      errors[BankField.holderName] = BankFieldError.invalid;
    }

    if (i.accountNumber.trim().isEmpty) {
      errors[BankField.accountNumber] = BankFieldError.required;
    } else if (!isValidAccountNumber(i.accountNumber)) {
      errors[BankField.accountNumber] = BankFieldError.invalid;
    }

    if (i.confirmAccountNumber.trim().isEmpty) {
      errors[BankField.confirmAccountNumber] = BankFieldError.required;
    } else if (digitsOnly(i.confirmAccountNumber) !=
        digitsOnly(i.accountNumber)) {
      errors[BankField.confirmAccountNumber] = BankFieldError.mismatch;
    }

    if (i.ifsc.trim().isEmpty) {
      errors[BankField.ifsc] = BankFieldError.required;
    } else if (!isValidIfsc(i.ifsc)) {
      errors[BankField.ifsc] = BankFieldError.invalid;
    }
    return errors;
  }
}

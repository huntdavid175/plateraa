package expo.modules.plateraacrypto

import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.security.MessageDigest
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * The offline PIN check. Same algorithm and format as the server
 * (`pbkdf2-sha256$iterations$salt$hash`, base64url), done natively because it runs tens of
 * thousands of HMAC rounds.
 */
class PlateraaCryptoModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PlateraaCrypto")

    AsyncFunction("verifyPinAsync") { verifier: String, pin: String ->
      val parts = verifier.split('$')
      if (parts.size != 4 || parts[0] != "pbkdf2-sha256") return@AsyncFunction false
      val iterations = parts[1].toIntOrNull() ?: return@AsyncFunction false
      val salt = decodeBase64Url(parts[2])
      val expected = decodeBase64Url(parts[3])
      val derived = pbkdf2Sha256(pin.toByteArray(Charsets.UTF_8), salt, iterations, expected.size)
      MessageDigest.isEqual(derived, expected)
    }
  }
}

private fun decodeBase64Url(value: String): ByteArray =
  Base64.decode(value, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)

/** PBKDF2-HMAC-SHA256 (RFC 8018), written out because javax.crypto only has it from Android 8. */
internal fun pbkdf2Sha256(password: ByteArray, salt: ByteArray, iterations: Int, length: Int): ByteArray {
  val mac = Mac.getInstance("HmacSHA256")
  mac.init(SecretKeySpec(password, "HmacSHA256"))
  val output = ByteArray(length)
  var block = 1
  var offset = 0
  while (offset < length) {
    mac.update(salt)
    mac.update(
      byteArrayOf(
        (block ushr 24).toByte(),
        (block ushr 16).toByte(),
        (block ushr 8).toByte(),
        block.toByte(),
      ),
    )
    var u = mac.doFinal()
    val t = u.copyOf()
    repeat(iterations - 1) {
      u = mac.doFinal(u)
      for (i in t.indices) t[i] = (t[i].toInt() xor u[i].toInt()).toByte()
    }
    val take = minOf(t.size, length - offset)
    System.arraycopy(t, 0, output, offset, take)
    offset += take
    block++
  }
  return output
}

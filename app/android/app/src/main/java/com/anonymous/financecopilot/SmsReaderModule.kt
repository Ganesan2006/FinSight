package com.anonymous.financecopilot

import android.Manifest
import android.content.pm.PackageManager
import android.provider.Telephony
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class SmsReaderModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "SmsReader"

  @ReactMethod
  fun readRecent(limit: Int, promise: Promise) {
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
      promise.reject("E_SMS_PERMISSION", "SMS access has not been granted.")
      return
    }

    try {
      val messages = Arguments.createArray()
      val safeLimit = limit.coerceIn(1, 100)
      val columns = arrayOf(Telephony.Sms._ID, Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE)
      context.contentResolver.query(
        Telephony.Sms.Inbox.CONTENT_URI,
        columns,
        null,
        null,
        "${Telephony.Sms.DATE} DESC"
      )?.use { cursor ->
        val idIndex = cursor.getColumnIndexOrThrow(Telephony.Sms._ID)
        val addressIndex = cursor.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
        val bodyIndex = cursor.getColumnIndexOrThrow(Telephony.Sms.BODY)
        val dateIndex = cursor.getColumnIndexOrThrow(Telephony.Sms.DATE)
        var count = 0
        while (cursor.moveToNext() && count < safeLimit) {
          val message = Arguments.createMap()
          message.putString("id", cursor.getString(idIndex))
          message.putString("sender", cursor.getString(addressIndex) ?: "")
          message.putString("body", cursor.getString(bodyIndex) ?: "")
          message.putDouble("timestamp", cursor.getLong(dateIndex).toDouble())
          messages.pushMap(message)
          count++
        }
      }
      promise.resolve(messages)
    } catch (error: Exception) {
      promise.reject("E_SMS_READ", "Could not read recent inbox messages.", error)
    }
  }
}

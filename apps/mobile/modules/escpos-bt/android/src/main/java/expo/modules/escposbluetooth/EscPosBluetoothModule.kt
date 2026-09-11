package expo.modules.escposbluetooth

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.Base64
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.UUID

/** Serial Port Profile: what cheap 58mm Bluetooth receipt printers speak. */
private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

class BluetoothUnavailableException :
  CodedException("BLUETOOTH_UNAVAILABLE", "Bluetooth is switched off or this tablet has none", null)

class BluetoothPermissionException :
  CodedException("BLUETOOTH_PERMISSION", "Allow Plateraa to use nearby devices to print", null)

class PrinterNotConnectedException :
  CodedException("PRINTER_NOT_CONNECTED", "The printer is not connected", null)

/**
 * ESC/POS printing over Bluetooth Classic. The receipt bytes are built in TypeScript; this module
 * only lists paired printers, holds one connection open and writes bytes to it.
 */
class EscPosBluetoothModule : Module() {
  private var socket: BluetoothSocket? = null

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private fun adapter(): BluetoothAdapter {
    val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    val adapter = manager?.adapter
    if (adapter == null || !adapter.isEnabled) throw BluetoothUnavailableException()
    return adapter
  }

  private fun requireConnectPermission() {
    if (
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
      context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) !=
        PackageManager.PERMISSION_GRANTED
    ) {
      throw BluetoothPermissionException()
    }
  }

  private fun disconnect() {
    try {
      socket?.close()
    } catch (_: Exception) {
      // Already closed.
    }
    socket = null
  }

  @SuppressLint("MissingPermission") // Checked by requireConnectPermission().
  override fun definition() = ModuleDefinition {
    Name("EscPosBluetooth")

    AsyncFunction("listBondedAsync") {
      requireConnectPermission()
      adapter().bondedDevices.map { device ->
        mapOf("name" to (device.name ?: "Unknown device"), "address" to device.address)
      }
    }

    AsyncFunction("connectAsync") { address: String ->
      requireConnectPermission()
      val bluetooth = adapter()
      disconnect()
      bluetooth.cancelDiscovery()
      val candidate = bluetooth.getRemoteDevice(address).createInsecureRfcommSocketToServiceRecord(SPP_UUID)
      candidate.connect()
      socket = candidate
    }

    AsyncFunction("writeAsync") { base64: String ->
      val output =
        socket?.takeIf { it.isConnected }?.outputStream ?: throw PrinterNotConnectedException()
      output.write(Base64.decode(base64, Base64.DEFAULT))
      output.flush()
    }

    AsyncFunction("disconnectAsync") { disconnect() }

    Function("isConnected") { socket?.isConnected == true }

    OnDestroy { disconnect() }
  }
}

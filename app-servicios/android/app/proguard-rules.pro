# Reglas de R8 del release (minifyEnabled + shrinkResources).
#
# Capacitor descubre sus plugins por REFLEXION (anotaciones @CapacitorPlugin / @PluginMethod). Sin reglas, R8 puede
# eliminar esos metodos y un release pierde funciones, o crashea, mientras el APK de depuracion (sin minimizar)
# funciona. Son las reglas recomendadas por la documentacion de Capacitor.
#
# SIEMPRE probar el release en un dispositivo despues de agregar un plugin nativo (push, geolocalizacion, ...).
-keep class com.getcapacitor.** { *; }
-keep public class * extends com.getcapacitor.Plugin { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * {
    @com.getcapacitor.annotation.PermissionCallback <methods>;
    @com.getcapacitor.annotation.ActivityCallback <methods>;
    @com.getcapacitor.PluginMethod public <methods>;
}
-keepattributes *Annotation*,InnerClasses,Signature,EnclosingMethod

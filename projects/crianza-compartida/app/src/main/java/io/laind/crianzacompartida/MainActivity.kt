package io.laind.crianzacompartida

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

private val forest = Color(0xFF35695F)
private val pale = Color(0xFFE4F2EC)
private val warm = Color(0xFFF8F7F3)
private val ink = Color(0xFF1F2E2B)
private val muted = Color(0xFF6A7773)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val prefs = getSharedPreferences("config", MODE_PRIVATE)
        setContent {
            MaterialTheme(colorScheme = lightColorScheme(primary=forest, surface=warm, background=warm)) {
                App(prefs.getString("api","") ?: "") { prefs.edit().putString("api", it).apply() }
            }
        }
    }
}

private class Api {
    var base = ""
    var token = ""

    fun request(method: String, path: String, data: JSONObject? = null): JSONObject {
        require(base.trim().startsWith("https://")) { "El servidor debe usar HTTPS" }
        val connection = URL(base.trim().trimEnd('/') + path).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = method
            connection.connectTimeout = 12000
            connection.readTimeout = 40000
            connection.setRequestProperty("Accept","application/json")
            if (token.isNotEmpty()) connection.setRequestProperty("Authorization","Bearer $token")
            if (method == "POST") {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type","application/json; charset=utf-8")
                connection.outputStream.use { it.write((data ?: JSONObject()).toString().toByteArray(Charsets.UTF_8)) }
            }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: "{}"
            val response = JSONObject(text)
            if (status !in 200..299) error(response.optString("error","Error HTTP $status"))
            return response
        } finally { connection.disconnect() }
    }
}

private data class Message(
    val id:String, val senderId:String, val sender:String,
    val body:String?, val neutral:Boolean, val status:String, val time:String
)

@Composable
private fun App(initialUrl:String, saveUrl:(String)->Unit) {
    val api = remember { Api() }
    var url by remember { mutableStateOf(initialUrl) }
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var joinCode by remember { mutableStateOf("") }
    var inviteCode by remember { mutableStateOf("") }
    var family by remember { mutableStateOf("") }
    var me by remember { mutableStateOf("") }
    var neutral by remember { mutableStateOf(false) }
    var page by remember { mutableStateOf("login") }
    var draft by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var notice by remember { mutableStateOf("") }
    var msgs by remember { mutableStateOf<List<Message>>(emptyList()) }
    val scope = rememberCoroutineScope()

    suspend fun call(method:String, path:String, body:JSONObject?=null):JSONObject =
        withContext(Dispatchers.IO) {
            api.base=url
            api.request(method,path,body)
        }

    suspend fun refresh() {
        val json=call("GET","/api/families/$family/messages").getJSONArray("messages")
        msgs=(0 until json.length()).map { i ->
            val o=json.getJSONObject(i)
            Message(
                o.getString("id"),o.getString("sender_id"),o.optString("sender_name","Adulto"),
                if(o.isNull("text")) null else o.optString("text"),
                o.optBoolean("neutral"),o.optString("status"),
                o.optString("created_at").replace("T"," ").take(16)
            )
        }
    }

    fun submit(task:suspend ()->Unit) {
        if(busy) return
        scope.launch {
            busy=true; notice=""
            try { task() }
            catch(e:Exception) { notice=e.message ?: "No se pudo completar la operación" }
            finally { busy=false }
        }
    }

    LaunchedEffect(page,family) {
        if(page=="chat" && family.isNotBlank()) {
            while(true) {
                try { refresh() } catch(_:Exception) {}
                delay(8000)
            }
        }
    }

    Column(Modifier.fillMaxSize().background(warm).systemBarsPadding()) {
        Row(
            Modifier.fillMaxWidth().padding(18.dp),
            verticalAlignment=Alignment.CenterVertically,
            horizontalArrangement=Arrangement.SpaceBetween
        ) {
            Column {
                Text("Crianza Compartida",fontSize=21.sp,fontWeight=FontWeight.Bold,color=forest)
                Text("Cuidar mejor, comunicarnos mejor",color=muted,fontSize=12.sp)
            }
            if(page!="login") TextButton(onClick={
                api.token=""; page="login"; family=""; msgs=emptyList(); inviteCode=""
            }) { Text("Salir") }
        }
        if(notice.isNotBlank()) Surface(color=Color(0xFFFFE8E3),modifier=Modifier.fillMaxWidth().padding(horizontal=16.dp)) {
            Text(notice,color=Color(0xFF9B4139),modifier=Modifier.padding(10.dp),fontSize=13.sp)
        }

        when(page) {
            "login" -> Column(
                Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),
                verticalArrangement=Arrangement.spacedBy(14.dp)
            ) {
                Title("Tu espacio compartido")
                Text("Conectá a dos responsables para mantener una conversación organizada.",color=muted)
                OutlinedTextField(url,{url=it},label={Text("Servidor HTTPS")},modifier=Modifier.fillMaxWidth(),singleLine=true)
                OutlinedTextField(username,{username=it},label={Text("Nombre de usuario")},modifier=Modifier.fillMaxWidth(),singleLine=true)
                OutlinedTextField(password,{password=it},label={Text("Contraseña (mínimo 8 caracteres)")},
                    visualTransformation=PasswordVisualTransformation(),modifier=Modifier.fillMaxWidth(),singleLine=true)
                Button(
                    onClick={ submit {
                        val r=call("POST","/api/auth/login",JSONObject().put("name",username.trim()).put("password",password))
                        saveUrl(url.trim())
                        api.token=r.getString("token"); me=r.getString("user_id")
                        val f=call("GET","/api/families/current")
                        if(f.isNull("family")) page="family"
                        else {
                            val current=f.getJSONObject("family")
                            family=current.getString("id")
                            neutral=current.optInt("neutral_on")==1
                            page="chat"
                        }
                    } },modifier=Modifier.fillMaxWidth(),enabled=!busy
                ) { Text("Ingresar") }
                OutlinedButton(
                    onClick={ submit {
                        val r=call("POST","/api/auth/register",JSONObject().put("name",username.trim()).put("password",password))
                        saveUrl(url.trim())
                        api.token=r.getString("token");me=r.getString("user_id");page="family"
                    } },modifier=Modifier.fillMaxWidth(),enabled=!busy
                ) { Text("Crear cuenta") }
                Note("Modo neutral: el servidor procesa los mensajes con IA. Probá con datos ficticios; no cargues información sensible de menores.")
            }
            "family" -> Column(
                Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),
                verticalArrangement=Arrangement.spacedBy(15.dp)
            ) {
                Title("Vincular responsables")
                Text("Uno crea el grupo y comparte el código con el otro adulto.",color=muted)
                Button(onClick={ submit {
                    val r=call("POST","/api/families",JSONObject())
                    family=r.getString("family_id");inviteCode=r.getString("invite_code")
                    neutral=false;page="chat"
                } },modifier=Modifier.fillMaxWidth(),enabled=!busy) { Text("Crear grupo familiar") }
                HorizontalDivider()
                OutlinedTextField(joinCode,{joinCode=it},label={Text("Código de invitación")},modifier=Modifier.fillMaxWidth())
                OutlinedButton(onClick={ submit {
                    val r=call("POST","/api/families/join",JSONObject().put("code",joinCode.trim()))
                    family=r.getString("family_id");neutral=false;page="chat"
                } },modifier=Modifier.fillMaxWidth(),enabled=!busy) { Text("Unirme al grupo") }
            }
            else -> Column(Modifier.fillMaxSize()) {
                Surface(color=pale,shape=RoundedCornerShape(18.dp),modifier=Modifier.fillMaxWidth().padding(horizontal=16.dp)) {
                    Column(Modifier.padding(15.dp),verticalArrangement=Arrangement.spacedBy(8.dp)) {
                        Row(verticalAlignment=Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text("Modo neutral",fontWeight=FontWeight.Bold,color=ink,fontSize=17.sp)
                                Text("Una edición canónica por UUID",fontSize=12.sp,color=muted)
                            }
                            Switch(checked=neutral,enabled=!busy,onCheckedChange={ enabled ->
                                submit {
                                    call("POST","/api/families/$family/neutral",JSONObject().put("enabled",enabled))
                                    neutral=enabled
                                }
                            })
                        }
                        Text("Se aplica desde el momento de activación; no modifica mensajes anteriores. Los originales no reaparecen en vistas neutralizadas.",fontSize=12.sp,color=muted)
                        if(inviteCode.isNotEmpty()) {
                            HorizontalDivider()
                            Text("Compartí este código para invitar al otro responsable:",fontSize=12.sp)
                            Text(inviteCode,fontWeight=FontWeight.Bold,color=forest)
                        }
                    }
                }
                Text("Conversación",modifier=Modifier.padding(start=20.dp,top=16.dp,bottom=8.dp),
                    fontSize=19.sp,fontWeight=FontWeight.Bold,color=ink)
                LazyColumn(
                    modifier=Modifier.weight(1f),
                    contentPadding=PaddingValues(horizontal=16.dp,vertical=8.dp),
                    verticalArrangement=Arrangement.spacedBy(11.dp)
                ) {
                    if(msgs.isEmpty()) item { Note("Todavía no hay mensajes en este grupo.") }
                    items(msgs,key={it.id}) { msg ->
                        val mine=msg.senderId==me
                        Row(Modifier.fillMaxWidth(),horizontalArrangement=if(mine) Arrangement.End else Arrangement.Start) {
                            Surface(color=if(mine) pale else Color.White,
                                shape=RoundedCornerShape(15.dp),modifier=Modifier.fillMaxWidth(0.9f)) {
                                Column(Modifier.padding(12.dp),verticalArrangement=Arrangement.spacedBy(5.dp)) {
                                    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween) {
                                        Text(if(mine) "Vos" else msg.sender,fontWeight=FontWeight.Bold,color=forest,fontSize=12.sp)
                                        if(msg.neutral) Text("✦ Neutral",color=forest,fontSize=11.sp)
                                    }
                                    Text(msg.body ?: if(msg.status=="pending") "Editando mensaje..."
                                    else "Edición no disponible; se oculta el original.",fontSize=15.sp,color=ink)
                                    Text(msg.time,color=muted,fontSize=10.sp,modifier=Modifier.align(Alignment.End))
                                }
                            }
                        }
                    }
                }
                HorizontalDivider()
                Row(
                    Modifier.fillMaxWidth().padding(10.dp),
                    verticalAlignment=Alignment.Bottom,
                    horizontalArrangement=Arrangement.spacedBy(8.dp)
                ) {
                    OutlinedTextField(draft,{draft=it},placeholder={Text("Mensaje...")},maxLines=4,
                        modifier=Modifier.weight(1f),shape=RoundedCornerShape(16.dp))
                    Button(
                        onClick={ val text=draft.trim()
                            if(text.isNotEmpty()) submit {
                                call("POST","/api/families/$family/messages",
                                    JSONObject().put("id",UUID.randomUUID().toString()).put("text",text))
                                draft="";refresh()
                            }
                        },
                        enabled=!busy && draft.isNotBlank(),modifier=Modifier.height(56.dp)
                    ) { Text("Enviar") }
                }
            }
        }
        if(busy) LinearProgressIndicator(modifier=Modifier.fillMaxWidth())
    }
}

@Composable private fun Title(text:String) {
    Text(text,fontSize=27.sp,color=ink,fontWeight=FontWeight.Bold,lineHeight=34.sp)
}
@Composable private fun Note(text:String) {
    Surface(color=pale,shape=RoundedCornerShape(13.dp),modifier=Modifier.fillMaxWidth()) {
        Text(text,fontSize=13.sp,color=ink,modifier=Modifier.padding(14.dp))
    }
}

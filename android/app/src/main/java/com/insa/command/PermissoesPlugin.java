package com.insa.command;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/** Microfone do Manuel: consulta, pede ao Android e, se estiver bloqueado, abre a tela de permissões do app. */
@CapacitorPlugin(name = "Permissoes", permissions = { @Permission(alias = "microfone", strings = { Manifest.permission.RECORD_AUDIO }) })
public class PermissoesPlugin extends Plugin {

    private JSObject estadoAtual() {
        JSObject r = new JSObject();
        PermissionState st = getPermissionState("microfone");
        r.put("microfone", st == null ? "prompt" : st.toString());
        // negado sem possibilidade de perguntar de novo: só pelas configurações
        boolean bloqueado = st == PermissionState.DENIED && !getActivity().shouldShowRequestPermissionRationale(Manifest.permission.RECORD_AUDIO);
        r.put("bloqueado", bloqueado);
        return r;
    }

    @PluginMethod
    public void estado(PluginCall call) { call.resolve(estadoAtual()); }

    @PluginMethod
    public void pedirMicrofone(PluginCall call) {
        if (getPermissionState("microfone") == PermissionState.GRANTED) { call.resolve(estadoAtual()); return; }
        requestPermissionForAlias("microfone", call, "depoisDePedir");
    }

    @PermissionCallback
    private void depoisDePedir(PluginCall call) { call.resolve(estadoAtual()); }

    @PluginMethod
    public void abrirAjustes(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", getContext().getPackageName(), null));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }
}

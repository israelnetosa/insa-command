package com.insa.command;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PermissoesPlugin.class);   // antes do super: o plugin precisa existir quando a ponte sobe
        super.onCreate(savedInstanceState);
    }
}

"use strict";

var debug                = require('debug')('roon-extension-rotel'),
    util                 = require('util'),
    RoonApi              = require('node-roon-api'),
    RoonApiSettings      = require('node-roon-api-settings'),
    RoonApiStatus        = require('node-roon-api-status'),
    RoonApiSourceControl = require("node-roon-api-source-control"),
    RoonApiVolumeControl = require('node-roon-api-volume-control');

var nodeCleanup = require('node-cleanup');

var RotelDevice = require("./rotel-device");
var rotel = {};

var roon = new RoonApi({
    extension_id:        'eu.bsc101.roon.rotel',
    display_name:        'Rotel Volume/Source Control',
    display_version:     '1.0.0',
    publisher:           'Boris Schaedler',
    email:               'dev@bsc101.eu',
    website:             'https://github.com/bsc101/roon-extension-rotel',
});

var mysettings = roon.load_config("settings") || {
    displayname: "Rotel Device",
    hostname: "",
    port: "9590",
    source: "aux",
    id: Math.floor(Math.random() * 65536)
};

function make_layout(settings) {
    var l = {
        values:    settings,
        layout:    [],
        has_error: false
    };

    l.layout.push({
        type:      "string",
        title:     "Display Name",
        subtitle:  "The name of your Rotel device",
        maxlength: 256,
        setting:   "displayname",
    });
    l.layout.push({
        type:      "string",
        title:     "Host Name or IP Address",
        subtitle:  "The host name or IP address of your Rotel device",
        maxlength: 256,
        setting:   "hostname",
    });
    l.layout.push({
        type:      "string",
        title:     "Port",
        subtitle:  "The port of your Rotel device (e.g. 9590)",
        maxlength: 5,
        setting:   "port"
    });
    l.layout.push({
        type:      "string",
        title:     "Source",
        subtitle:  "The source of your Rotel device for music playback (e.g. aux, coax1, opt2, ...)",
        maxlength: 10,
        setting:   "source",
    });

    return l;
}

var svc_settings = new RoonApiSettings(roon, {
    get_settings: function(cb) 
    {
        cb(make_layout(mysettings));
    },
    save_settings: function(req, isdryrun, settings) 
    {
        let l = make_layout(settings.values);
        req.send_complete(l.has_error ? "NotValid" : "Success", { settings: l });

        if (!isdryrun && !l.has_error) 
        {
            if (!mysettings.id)
                mysettings.id = Math.floor(Math.random() * 65536);
            let _name = mysettings.displayname;
            let _id = mysettings.id;

            mysettings = l.values;
            mysettings.id = _name == mysettings.displayname ? _id : Math.floor(Math.random() * 65536);

            svc_settings.update_settings(l);
            roon.save_config("settings", mysettings);

            setup();
        }
    }
});

var svc_status = new RoonApiStatus(roon);
var svc_volume_control = new RoonApiVolumeControl(roon);
var svc_source_control = new RoonApiSourceControl(roon);

roon.init_services({
    provided_services: [ svc_status, svc_settings, svc_volume_control, svc_source_control ]
});

function setup() 
{
    svc_status.set_status("Disconnected", false);

    if (!mysettings.hostname)
        return;
    if (mysettings.hostname.length <= 0)
        return;
    if (!mysettings.port)
        return;
    if (mysettings.port.length <= 0)
        return;

    if (rotel.device)
    {
        rotel.device.disconnect();
        delete(rotel.device);
    }
    if (rotel.source_control)
    {
        rotel.source_control.destroy();
        delete(rotel.source_control);
    }
    if (rotel.volume_control) 
    {
        rotel.volume_control.destroy();
        delete(rotel.volume_control);
    }

    rotel.device = new RotelDevice();
    rotel.device.on('connected', ev_connected);
    rotel.device.on('volume', ev_volume);
    rotel.device.on('mute', ev_mute);
    rotel.device.on('power', ev_power);
    rotel.device.on('source', ev_source);
    rotel.device.on('connecting', ev_connecting);
    rotel.device.on('error', ev_error);

    debug("Connecting to %s:%s...", mysettings.hostname, mysettings.port);
    rotel.device.connect(mysettings.hostname, Number.parseInt(mysettings.port));
}

function ev_connecting()
{
    svc_status.set_status("Connecting to '" + mysettings.displayname + "'...", false);
}

function ev_connected(data) 
{
    debug(data);
    debug(mysettings);

    rotel.volume_value = data.volume;
    rotel.power = data.power;
    rotel.source = data.source;
    rotel.volume_min = data.volume_min;
    rotel.volume_max = data.volume_max;

    if (rotel.volume_control)
    {
        debug("Reconnected...");

        rotel.volume_control.update_state({ 
            volume_value: rotel.volume_value, 
            volume_min:   rotel.volume_min,
            volume_max:   rotel.volume_max,
            is_muted:     data.muted 
        });
        rotel.source_control.update_state({ 
            status: (rotel.power == "on" && rotel.source == mysettings.source) ? "selected" : "standby" 
        });

        return;
    }

    debug("Connected...");

    svc_status.set_status("Connected to '" + mysettings.displayname + "'", false);

    debug("Registering volume control...");
    if (mysettings.id)
        svc_volume_control._id = mysettings.id;
    rotel.volume_control = svc_volume_control.new_device({
        state: {
            display_name: mysettings.displayname,
            volume_type:  "number",
            volume_min:   rotel.volume_min,
            volume_max:   rotel.volume_max,
            volume_value: rotel.volume_value,
            volume_step:  1,
            is_muted:     data.muted
        },
        set_volume: function (req, mode, value)
        {
            debug("set_volume: mode=%s value=%d", mode, value);

            let newVol = mode == "absolute" ? value : (rotel.volume_value + value);
            if (newVol < this.state.volume_min)
                newVol = this.state.volume_min;
            else if (newVol > this.state.volume_max)
                newVol = this.state.volume_max;
            
            if (rotel.volume_value != newVol)
            {
                rotel.device.set_volume(newVol);
            }
            
            req.send_complete("Success");
        },
        set_mute: function (req, action) 
        {
            debug("set_mute: action=%s", action);

            let muted = action == "on" ? true : false;
            rotel.device.set_mute(muted);

            req.send_complete("Success");
        }
    });

    debug("Registering source control...");
    if (mysettings.id)
        svc_source_control._id = mysettings.id;
    rotel.source_control = svc_source_control.new_device(
        {
        state: {
            display_name:     mysettings.displayname,
            supports_standby: true,
            status:           (data.power == "on" && data.source == mysettings.source) ? "selected" : "standby"
        },
        convenience_switch: function (req) 
        {
            debug("convenience_switch...")

            rotel.device.set_source(mysettings.source);

            req.send_complete("Success");
        },
        standby: function (req) 
        {
            debug("standby...")

            rotel.device.standby();

            req.send_complete("Success");
        }
    });
}

function ev_error(val)
{
    svc_status.set_status("ERROR: " + val, true);
}

function ev_volume(val) 
{
    debug("Volume changed:", val);

    rotel.volume_value = val;
    if (rotel.volume_control) 
    {
        rotel.volume_control.update_state({ volume_value: val });
    }
}

function ev_mute(val)
{
    debug("Mute changed:", val);

    if (rotel.volume_control)
    {
        rotel.volume_control.update_state({ is_muted: val == "on" });
    }
}

function ev_source(val) 
{
    if (rotel.source != val)
    {
        debug("Source changed:", val);

        rotel.source = val;
        if (rotel.source_control)
        {
            rotel.source_control.update_state({ status: (rotel.power == "on" && rotel.source == mysettings.source) ? "selected" : "standby" });
        }
    }
}

function ev_power(val) 
{
    if (rotel.power != val)
    {
        debug("Power changed:", val);

        rotel.power = val;
        if (rotel.source_control)
        {
            rotel.source_control.update_state({ status: (rotel.power == "on" && rotel.source == mysettings.source) ? "selected" : "standby" });
            if (rotel.power != "on")
            {
                rotel.volume_control.update_state({ volume_value: 0, is_muted: false });
            }
        }
    }
}

nodeCleanup(function (exitCode, signal)
{
    debug("Cleanup...");

    if (rotel.device)
    {
        rotel.device.disconnect();
        delete(rotel.device);
    }
    if (rotel.source_control)
    {
        rotel.source_control.destroy();
        delete(rotel.source_control);
    }
    if (rotel.volume_control) 
    {
        rotel.volume_control.destroy();
        delete(rotel.volume_control);
    }
    
    debug("Cleanup... done");
});

setup();

roon.start_discovery();

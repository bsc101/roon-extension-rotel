"use strict";

let util         = require("util"),
    events       = require('events'),
    net          = require('net'),
    debug        = require('debug')('rotel-device'),
    debug_socket = require('debug')('rotel-socket');

function RotelDevice() 
{
    debug("RotelDevice...");

    this._init();
    this.abandoned = false;
}

util.inherits(RotelDevice, events.EventEmitter);

RotelDevice.prototype._init = function()
{
    this.data = "";
    this.dataTime = 0;
    this.connectTime = 0;
    this.connecting = false;
    this.connected = false;
    this.volume = 0;
    this.volumeMin = 0;
    this.volumeMax = 96;
    this.muted = false;
    this.source = "";
    this.power = "";
    this.host = "";
    this.port = 9590;
}

RotelDevice.prototype._process = function(data)
{
    if (typeof data === 'string')
    {
        this.data += data;

        while (this.data.length > 0)
        {
            debug("processing: " + this.data);

            if (this.data.startsWith("!00:power_on!"))
            {
                this.data = this.data.substr(13);
                continue;
            }
            if (this.data.startsWith("!00:power_off!"))
            {
                this.data = this.data.substr(14);
                continue;
            }

            if (this.data.startsWith("display="))
            {
                if (this.data.length <= 12)
                    break;

                var len = Number.parseInt(this.data.substr(8, 3));
                if (this.data.length < 12 + len)
                    break;

                this.data = this.data.substr(12 + len);
                
                continue;
            }

            var idx = this.data.indexOf("!");
            if (idx <= 0)
                break;

            var _data = this.data.substr(0, idx);
            this.data = this.data.substr(idx + 1);

            if (_data.startsWith("volume="))
            {
                var _vol = _data.substr(7);
                if (_vol == 'max')
                    _vol = '96';
                var vol = Number.parseInt(_vol);
                debug("vol = " + vol);
    
                this.volume = vol;
                if (!this.connecting)
                {
                    this.emit('volume', vol);
                }
                else
                {
                    this.connecting = false;
                    this.connected = true;
                    this.emit('connected', { 
                        volume: this.volume, 
                        muted: this.muted, 
                        power: this.power, 
                        source: this.source,
                        volume_min: this.volumeMin,
                        volume_max: this.volumeMax
                    });
                }
            }
            else if (_data.startsWith("volume_min="))
            {
                var _volMin = _data.substr(11);
                var volMin = Number.parseInt(_volMin);
                debug("volMin = " + volMin);
                this.volumeMin = volMin;
            }
            else if (_data.startsWith("volume_max="))
            {
                var _volMax = _data.substr(11);
                var volMax = Number.parseInt(_volMax);
                debug("volMax = " + volMax);
                this.volumeMax = volMax;
            }
            else if (_data.startsWith("source="))
            {
                var _source = _data.substr(7);
                this.source = _source;
                if (!this.connecting)
                {
                    this.emit('source', _source);
                }
            }
            else if (_data.startsWith("mute="))
            {
                var _muted = _data.substr(5);
                this.muted = _muted == "on";
                if (!this.connecting)
                {
                    this.emit('mute', _muted);
                }
            }
            else if (_data.startsWith("power="))
            {
                var wasOn = this.power == "on";
                var _power = _data.substr(6);
                this.power = _power;
                if (!this.connecting)
                {
                    this.emit('power', _power);
                }
                else
                {
                    if (_power != "on")
                    {
                        this.connecting = false;
                        this.connected = true;
                        this.emit('connected', { 
                            volume: this.volume, 
                            muted: this.muted, 
                            power: this.power, 
                            source: this.source,
                            volume_min: this.volumeMin,
                            volume_max: this.volumeMax
                        });
                    }
                }
                if (!wasOn && this.power == "on")
                {
                    this.socket.write("get_volume_min!");
                    this.socket.write("get_volume_max!");
                    this.socket.write("get_mute_status!");
                    this.socket.write("get_current_source!");
                    this.socket.write("get_volume!");
                }
            }
        }
    }
}

RotelDevice.prototype.connect = function(host, port)
{
    if (this.timeoutConnect)
    {
        clearTimeout(this.timeoutConnect);
        delete(this.timeoutConnect);
    }

    if (!this.socket && !this.abandoned)
    {
        var _this = this;

        this._init();

        if (!port)
            port = 9590;

        this.host = host;
        this.port = port;

        this.socket = new net.Socket();
        this.socket.setEncoding('ascii');
        this.socket.setNoDelay(true);
    
        this.socket.on('connect', function() 
        {
            debug_socket("connected");
    
            _this.socket.write("get_current_power!");
        });
    
        this.socket.on('close', function(had_error)
        {
            debug_socket("closed");

            if (_this.timer)
            {
                clearInterval(_this.timer);
                delete(_this.timer);
            }
            delete(_this.socket);
            _this.connected = false;
            _this.connecting = false;
        });
    
        this.socket.on('end', function()
        {
            debug_socket("end");
        });
    
        this.socket.on('error', function(exception)
        {
            debug_socket("error:", exception.toString());

            _this.socket.destroy();

            if (_this.abandoned)
            {
                debug_socket("abandoned...");
                return;
            }

            _this.emit('error', exception.toString());
            _this.timeoutConnect = setTimeout(() => 
            {
                _this.connect(_this.host, _this.port);
            }, 5000);
        });
    
        this.socket.on('timeout', function()
        {
            debug_socket("timeout");
        });
    
        this.socket.on('data', function(data)
        {
            debug_socket("data = " + data);
            _this.dataTime = new Date().getTime();
            _this._process(data);
        });
    
        debug("connecting to %s:%d...", host, port);

        this.emit('connecting');

        this.connectTime = new Date().getTime();
        this.connecting = true;
        this.connected = false;

        try 
        {
            this.socket.connect(port, host);
            
            this.timer = setInterval(() => 
            {
                if (_this.abandoned)
                {
                    _this.socket.destroy();
                    return;
                }

                if (_this.connected)
                {
                    if (new Date().getTime() - _this.dataTime > 7500)
                    {
                        _this.socket.destroy();
                        _this.timeoutConnect = setTimeout(() => 
                        {
                            _this.connect(_this.host, _this.port);
                        }, 1000);
                    }
                    else
                    {
                        _this.socket.write("get_current_power!");
                    }
                }
                else if (_this.connecting)
                {
                    if (new Date().getTime() - _this.dataTime > 7500)
                    {
                        _this.socket.destroy();
                        _this.timeoutConnect = setTimeout(() => 
                        {
                            _this.connect(_this.host, _this.port);
                        }, 1000);
                    }
                }
            }, 5000);
        } 
        catch (error) 
        {
            debug("connect failed:", error.toString());

            this.emit('error', error.toString());
        }
    }
}

RotelDevice.prototype.disconnect = function() 
{
    this.abandoned = true;

    if (this.socket)
    {
        this.socket.destroy();
    }
}

RotelDevice.prototype.set_volume = function(vol)
{
    if (this.socket)
    {
        if (this.power == "on")
        {
            if (vol < 1)
                vol = 1;
            else if (vol > 95)
                vol = 95;
            this.socket.write("volume_" + vol + "!");
        }
    }
}

RotelDevice.prototype.set_source = function(source)
{
    if (this.socket)
    {
        this.socket.write("power_on!");
        this.socket.write(source + "!");
    }
}

RotelDevice.prototype.set_mute = function(mute)
{
    if (this.socket)
    {
        if (this.power == "on")
        {
            this.socket.write(mute ? "mute_on!" : "mute_off!");
        }
    }
}

RotelDevice.prototype.standby = function()
{
    if (this.socket)
    {
        this.socket.write("power_off!");
    }
}

exports = module.exports = RotelDevice;

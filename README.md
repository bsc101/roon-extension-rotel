## Controlling Rotel Amps from Roon

This project provides a Roon Volume/Source Control Extension that allows you to control volume/mute/standby of your Rotel device from within Roon. The Rotel device is controlled via its network interface (not RS232!). Currently devices like the RC 1590 preamp are supported (new ASCII based IP protocol with commands like 'power_on!' and so on, have a look at the Rotel homepage for more details or contact me if you are not sure). 

Credits: 
This code is based on the following projects:
   * Meridian Volume/Source Control by RoonLabs: https://github.com/RoonLabs/roon-extension-meridian
   * Denon/Marantz Volume/Source Control by docbobo: https://github.com/docbobo/roon-extension-denon
   * Onkyo/Pioneer Volume/Source Control by marcelveldt: https://github.com/marcelveldt/roon-extension-onkyo

## Installation

1. Install Node.js from https://nodejs.org

   * On Windows, install from the above link.
   * On Mac OS, you can use [homebrew](http://brew.sh) to install Node.js.
   * On Linux, you can use your distribution's package manager, but make sure it installs a recent Node.js. Otherwise just install from the above link.

2. Install Git from https://git-scm.com/downloads

   * Following the instructions for the Operating System you are running.

3. Download this project

   * Go to the [roon-extension-rotel](https://github.com/bsc101/roon-extension-rotel) page on [GitHub](https://github.com).
   * Click the green 'Clone or Download' button and select 'Download ZIP'.

4. Extract the zip file in a local folder

5. Change directory to the extension in the local folder

    ```
    cd <local_folder>/roon-extension-rotel
    ```
    *Replace `<local_folder>` with the local folder path.*

6. Install the dependencies

    ```bash
    npm install
    ```

7. Run it!

    ```bash
    node .
    ```

    The extension should appear in Roon now. Go to Settings->Extensions and you should see it in the list. Once it has been setup correctly, the extension can be added as 'Volume/Source Control' to an existing output zone.

## Notes

* Setups with more than one Roon Core on the network are not tested.
* Rotel device tested: Rotel RC 1590
* For source control and power signalling to work correctly, you need to enter the name of the source in the settings for the extension (e.g. aux, coax1, opt2, ...).
* Make sure your Rotel device has network standby enabled: set power mode to 'quick'. Otherwise you will not be able to turn your device on from within Roon.
* If you want to start more than one instance of this extension, you have to specify some arbitrary instance name. Start every instance with a different instance name:
    ```bash
    node . -inst:your_instance_name
    ```
    Example:
    ```bash
    node . -inst:RotelAmp1
    ```
    and:
    ```bash
    node . -inst:RotelAmp2
    ```
    This is needed if you have more than one Rotel amp or more than one Roon device connected to one amp.

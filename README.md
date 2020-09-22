pi_slide_show
=============

This project contains two distinct parts:

* A Perl library for generating a slideshow.json file
* A light weight site for reading the JSON file and displaying the pictures

Setup is fairly straight forward and is done in two steps.

# Perl Setup

* (Not required) Setup [plenv](https://github.com/tokuhirom/plenv)
  * Once plenv is installed then grab perl.  As of this writing 5.22.0 has been tested, but there shouldn't be anything that would prevent newer versions of perl.

  ```
  plenv install 5.22.0
  plenv rehash
  plenv install-cpanm
  plenv local 5.22.0 (in your pi_slide_show directory)

  ```

* Install [Carton](https://metacpan.org/pod/Carton)

  cpanm install Carton

* Install modules

  carton install

* Edit the generate_slideshow.yml file

  cp generate_slideshow.yml.example generate_slideshow.yml
  edit generate_slideshow.yml

* run generate_slideshow.pl to create the slideshow.json file.  If you installed under carton/plenv then there is a helper script called run.sh.example that you will want to look at.  It sets up the plenv env and runs carton exec on generate_slideshow.pl.  This is particularly useful if you are going to automate the script in cron or some such.

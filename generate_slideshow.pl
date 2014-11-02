#!/usr/bin/env perl

use strict;
use warnings;

use FindBin qw($Bin);
use lib "$Bin/lib";
use Photo::SlideShow;
use YAML::XS;
use Data::Debug;

my $config = {};
if (-e "$Bin/generate_slideshow.yml") {
    $config = YAML::XS::LoadFile("$Bin/generate_slideshow.yml");
}

$config->{'output_file'} ||= "$Bin/www/slideshow.json";

my $ss = Photo::SlideShow->new(%$config);
$ss->generate_list_perl();



#!/usr/bin/env node

var Gaze = require('gaze').Gaze,
  sys = require('sys'),
  fs = require('fs'),
  exec = require('child_process').exec,
  program = require('commander'),
  cwd = process.cwd();

program
  .version('0.0.1')
  .option('-t, --target [target]', '[target] File')
  .option('-T, --targetHeader [targetHeader]', 'Markdown formatted [targetHeader]')
  .option('-l, --listFiles [listFiles]', '[listFiles] to watch')
  .option('-L, --listFilesHeader [listFilesHeader]', 'Markdown formatted [listFilesHeader]')
  .parse(process.argv);

console.log('Target: %j', program.target);
console.log('Target Header: %j', program.targetHeader);
console.log('Lists Files: %j', program.listFiles);
console.log('List Files Header: %j', program.listFilesHeader);
console.log('-------- Running --------');

init();

function init() {

  var gaze = new Gaze(program.listFiles);

  gaze.on('error', function(error) {
    console.log('An error has occured: ' + error);
  });

  gaze.on('nomatch', function() {
    console.log('No matches found');
  });

  gaze.on('all', function(event, filepath) {
    // Adding/Deleting files
    if (event === 'deleted' || event === 'added') {
      console.log(filepath.substring(cwd.length) + ' ' + event);
      // Remove the target file (since race conditions are dumb)
      gaze.remove(cwd + program.target.substring(1));
      docToc(gaze.watched(), function() {
        gaze.add(cwd + program.target.substring(1));
      });
    }

    // Changed on target file
    if (event === 'changed' &&
      (filepath.substring(cwd.length) === program.target.substring(1))) {
      console.log('Running doctoc on ' + program.target);
      docToc(gaze.watched());
    }
  });
}

function docToc(files, callback) {
  var execString = 'doctoc ' + program.target + ' --github';
  exec(execString, function(err, stdout, stderr) {
    // Don't show normal output as it doesn't matter, just show errors
    // console.log(stdout);
    if(stderr) {
      console.log('------ stderr ------');
      console.log(stderr);
    }
    if(err !== null) {
      console.log('exec error: ' + error);
    }

    updateReadme(mdTree(files, cwd));

    if(callback) {
      callback();
    }
  });
}

function mdTree(fileTree, cwd) {
  // markdonw list needs to start off w/ empty line;
  var line = ['', program.listFilesHeader];

  var keys = Object.keys(fileTree);

  keys.forEach(function(key) {
    var tabs = keys.indexOf(key) + 1;

    line.push([
      Array(tabs).join('  '),
      '- ',
      generateMdLink(key, cwd),
    ].join(''));

    fileTree[key].forEach(function(file) {
      if (keys.indexOf(file) < 0) {
        line.push([
          Array(tabs + 1).join('  '),
          '- ',
          generateMdLink(file, cwd),
        ].join(''));
      }
    });
  });

  // Dedupe
  line.filter(function(x, idx) {
    return line.indexOf(x) === idx;
  });

  line.push('');

  return line;
}

function generateMdLink(link, cwd) {
  var mdEscape = /([_*])/g;
  return [
    '[',
    link
      .substring(cwd.length)
      .replace(mdEscape, '\\$1')
      .split('/')
      .filter(function(x) {
        return x !== '';
      })
      .pop(),
    '](',
    link.substring(cwd.length),
    ')',
  ].join('');
}

function updateReadme(fileList) {
  if (fileList.length) {
    var file = fs.readFileSync(program.target, 'utf8');

    fileList
      .push('<!-- END doctoc generated TOC please keep comment here to allow auto update -->')

    var dirtyFile = file
      .replace(
        '**Table of Contents**  *generated with [DocToc](https://github.com/thlorenz/doctoc)*',
        program.targetHeader
      )
      .replace(
        '<!-- END doctoc generated TOC please keep comment here to allow auto update -->',
        fileList.join('\n')
      );

    fs.writeFileSync(program.target, dirtyFile, 'utf8');

    console.log('Readme Updated');
  }
}
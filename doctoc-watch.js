#!/usr/bin/env node

var Gaze = require('gaze').Gaze, // File watcher
  fs = require('fs'), // File System tasks
  exec = require('child_process').exec, // Enable execution of bash
  program = require('commander'), // Easy program flags
  cwd = process.cwd(); // Current Working Directory

// Functions for commander "program" for easy options
// Takes input and outputs an array
function list(val) {
  return val.split(',');
}

program
  .version('0.0.1')
  .option('-t, --target [target]', '[target] File')
  .option('-T, --targetHeader [targetHeader]', 'Markdown formatted [targetHeader]')
  .option('-l, --listFiles [listFiles]', '[listFiles] to watch', list)
  .option('-L, --listFilesHeader [listFilesHeader]', 'Markdown formatted [listFilesHeader]')
  .option('-o, --output', 'Verbose output of options')
  .option('-r, --runOnce', 'Run only once, without watching')

  .parse(process.argv);

// Lets outpout all the options, if -v is set
if (program.output) {
  console.log('Target: %j', program.target);
  console.log('Target Header: %j', program.targetHeader);
  console.log('Lists Files: %j', program.listFiles);
  console.log('List Files Header: %j', program.listFilesHeader);
  if(program.runOnce) {
    console.log('Running once without watch');
  }
  console.log('-------- Running --------');
}

init();

// This function sets up all the file watcher
function init() {
  var gaze = new Gaze(program.listFiles);

  if(program.runOnce) {
    docToc(gaze.watched());
    gaze.close();
    return;
  }

  gaze.on('error', function(error) {
    console.log('An error has occured: ' + error);
  });

  gaze.on('nomatch', function() {
    console.log('No matches found');
  });

  gaze.on('all', function(event, filepath) {
    // Adding/Deleting files
    if (event === 'deleted' || event === 'added') {
      if (program.output) {
        console.log(filepath.substring(cwd.length) + ' ' + event);
      }
      // Remove the target file (since race conditions are dumb)
      gaze.remove(cwd + program.target.substring(1));
      docToc(gaze.watched(), function() {
        gaze.add(cwd + program.target.substring(1));
      });
    }

    // Changed on target file
    if (event === 'changed' &&
      (filepath.substring(cwd.length) === program.target.substring(1))) {
      if (program.output) {
        console.log('Running doctoc on ' + program.target);
      }
      docToc(gaze.watched());
    }
  });
}

/**
 * Runs the doctoc via exec on the program target
 * @param  {array}   files      array of all files wated
 * @param  {Function} callback  callback to execute once exec is finished
 * @return {null}               no return
 */
function docToc(files, callback) {
  var execString = 'doctoc ' + program.target + ' --github';
  exec(execString, function(err, stdout, stderr) {
    if(stderr) {
      console.log(stderr);
    }
    if(err !== null) {
      throw error;
    }

    updateReadme(mdTree(files, cwd));

    if(callback) {
      callback();
    }
  });
}

/**
 * Convert the filename to a link
 * @param  {string} file  filename to convert to link
 * @param  {string} cwd   current working directory
 * @return {string}       markdown string
 */
function generateMarkdown(file, cwd, nolink) {
  var mdEscape = /([_*])/g;
  if(!nolink) {
    return [
      '[',
      file
        .substring(cwd.length)
        .replace(mdEscape, '\\$1')
        .split('/')
        .filter(function(x) {
          return x !== '';
        })
        .pop(),
      '](',
      file.substring(cwd.length),
      ')',
    ].join('');
  } else {
    return [
      '**',
      file
        .substring(cwd.length)
        .replace(mdEscape, '\\$1')
        .split('/')
        .filter(function(x) {
          return x !== '';
        })
        .pop(),
      '**',
    ].join('');
  }
}

/**
 * Build the filetree to append to the doctoc output
 * @param  {array} fileTree   array of watched files
 * @param  {string} cwd       current working directory
 * @return {array}            filetree to append to doctoc output
 */
function mdTree(fileTree, cwd) {
  // markdonw list needs to start off w/ empty line;
  var line = ['', program.listFilesHeader];

  var keys = Object.keys(fileTree);

  keys.forEach(function(key) {
    if (fileTree[key].length === 0) {
      return;
    }
    if (keys.indexOf(key) !== 0) {
      line.push([,
        '- ',
        generateMarkdown(key, cwd, true),
      ].join(''));
    }

    fileTree[key].forEach(function(file) {
      // Skip if directory and not in root
      if (file[file.length - 1] === '/'
        && keys.indexOf(file) < 0) {
        return;
      }
      if (keys.indexOf(file) < 0) {
        line.push([
          (keys.indexOf(key) !== 0) ? '  - ': '',
          generateMarkdown(file, cwd),
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

/**
 * Write the markdown tree to the end of doctoc output
 * @param  {array} mdTree   array of lines to append to doctoc output
 * @return {null}           no return
 */
function updateReadme(mdTree) {
  if (mdTree.length) {
    var file = fs.readFileSync(program.target, 'utf8');

    mdTree
      .push('<!-- END doctoc generated TOC please keep comment here to allow auto update -->')

    var dirtyFile = file
      .replace(
        '**Table of Contents**  *generated with [DocToc](https://github.com/thlorenz/doctoc)*',
        program.targetHeader
      )
      .replace(
        '<!-- END doctoc generated TOC please keep comment here to allow auto update -->',
        mdTree.join('\n')
      );

    fs.writeFileSync(program.target, dirtyFile, 'utf8');

    console.log('Readme Updated');
  }
}
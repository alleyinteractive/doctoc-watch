#!/usr/bin/env node
'use strict';

var Gaze = require('gaze').Gaze; // File watcher
var fs = require('fs'); // File System tasks
var exec = require('child_process').exec; // Enable execution of bash
var program = require('commander'); // Easy program flags
var cwd = process.cwd(); // Current Working Directory

program.version('0.0.1').option('-t, --target [target]', '[target] File').option('-T, --targetHeader [targetHeader]', 'Markdown formatted [targetHeader]').option('-l, --listFiles [listFiles]', '[listFiles] to watch', function (val) {
  return val.split(',');
}).option('-L, --listFilesHeader [listFilesHeader]', 'Markdown formatted [listFilesHeader]').option('-o, --output', 'Verbose output of options').option('-r, --runOnce', 'Run only once, without watching').parse(process.argv);

// Lets outpout all the options, if -v is set
if (program.output) {
  console.log('Target: %j', program.target);
  console.log('Target Header: %j', program.targetHeader);
  console.log('Lists Files: %j', program.listFiles);
  console.log('List Files Header: %j', program.listFilesHeader);
  if (program.runOnce) {
    console.log('Running once without watch');
  }
  console.log('-------- Running --------');
}

init();

// This function sets up all the file watcher
function init() {
  var gaze = new Gaze(program.listFiles);

  if (program.runOnce) {
    docToc(gaze.watched());
    gaze.close();
    return;
  }

  gaze.on('error', function (error) {
    console.log('An error has occured: ' + error);
  });

  gaze.on('nomatch', function () {
    console.log('No matches found');
  });

  gaze.on('all', function (event, filepath) {
    // Adding/Deleting files
    if (event === 'deleted' || event === 'added') {
      if (program.output) {
        console.log(filepath.substring(cwd.length) + ' ' + event);
      }
      // Remove the target file (since race conditions are dumb)
      gaze.remove(cwd + program.target.substring(1));
      docToc(gaze.watched(), function () {
        gaze.add(cwd + program.target.substring(1));
      });
    }

    // Changed on target file
    if (event === 'changed' && filepath.substring(cwd.length) === program.target.substring(1)) {
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
  exec(execString, function (err, stdout, stderr) {
    if (stderr) {
      console.log(stderr);
    }
    if (err !== null) {
      throw error;
    }

    updateReadme(mdTree(files, cwd));

    if (callback) {
      callback();
    }
  });
}

/**
 * Convert the filename to a link
 * @param  {string} file    filename to convert to link
 * @param  {string} cwd     current working directory
 * @param  {bool}   nolink  should it generate a link?
 * @return {string}         markdown string
 */
function generateMarkdown(file, cwd, nolink) {
  var noLink = noLink || false;
  var mdEscape = /([_*])/g;
  var text = file.substring(cwd.length).replace(mdEscape, '\\$1').split('/').filter(function (x) {
    return x !== '';
  }).pop();

  return noLink ? '**' + text + '**' : '[' + text + '](' + file.substring(cwd.length) + ')';
}

function isDir(testStr) {
  return testStr[testStr.length - 1] === '/';
}

/**
 * Build the filetree to append to the doctoc output
 * @param  {object} fileTree   object of watched files
 * @param  {string} cwd       current working directory
 * @return {array}            filetree to append to doctoc output
 */
function mdTree(fileTree, cwd) {
  // markdown list needs to start off w/ empty line;
  var tree = ['', program.listFilesHeader, ''];

  // First is root filetree, so only use first key
  tree = tree.concat(recursiveBuildTree(fileTree, Object.keys(fileTree)[0], cwd, 1));

  // Dedupe, ignoring ''
  tree.filter(function (x, idx) {
    return (tree.indexOf(x) === idx || x === '') && x !== 'undefined';
  });

  // markdown list needs to end w/ empty line;
  tree.push('');
  return tree;
}

/**
 * Recursively dig and build nesting for the mdTree
 * @param  {object} fileTree  object of watched files
 * @param  {string} currKey   current key of the filetree
 * @param  {string} cwd       current working directory
 * @param  {int}    depth     depth of the recursion
 * @return {arry}             array of lines for the mdTree
 */
function recursiveBuildTree(fileTree, currKey, cwd, depth) {
  var line = [];

  // If directory, recursive dig!!
  if (isDir(currKey) && fileTree[currKey]) {
    // Skip the root level
    if (depth !== 1) {
      var markdown = generateMarkdown(currKey, cwd, true);
      line.push(Array(depth).join('  ') + '- ' + markdown);
    }

    var nested = fileTree[currKey];
    nested.sort(function (a, b) {
      // Push directories below files
      if (isDir(a) && !isDir(b)) {
        return 1;
      } else if (!isDir(a) && isDir(b)) {
        return -1;
      }
      return 0;
    }).forEach(function (file) {
      if (isDir(file) && fileTree[file] === undefined) {
        return;
      } else {
        line = line.concat(recursiveBuildTree(fileTree, file, cwd, depth + 1));
      }
    });
    // If directory and not in filetree,
    // which means it's childfree
  } else if (isDir(currKey) && !fileTree[currKey]) {
      return;
      // Else treat as a filename
    } else {
        var markdown = generateMarkdown(currKey, cwd);
        line.push(Array(depth).join('  ') + '- ' + markdown);
      }
  return line;
}

/**
 * Write the markdown tree to the end of doctoc output
 * @param  {array} mdTree   array of lines to append to doctoc output
 * @return {null}           no return
 */
function updateReadme(mdTree) {
  if (mdTree.length <= 0) {
    return;
  }

  var file = fs.readFileSync(program.target, 'utf8');

  mdTree.push('<!-- END doctoc generated TOC please keep comment here to allow auto update -->');

  var dirtyFile = file.replace('**Table of Contents**  *generated with [DocToc](https://github.com/thlorenz/doctoc)*', program.targetHeader).replace('<!-- END doctoc generated TOC please keep comment here to allow auto update -->', mdTree.join('\n'));

  fs.writeFileSync(program.target, dirtyFile, 'utf8');

  console.log('Readme Updated');
}
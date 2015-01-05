var express = require('express');
var router = express.Router();
var auth = require('../config/auth');
var multiparty = require('multiparty');
var fs = require('fs');
//var smartgame = require('smartgame');
var Kifu = require('../models/kifu').Kifu;
var User = require('../models/user').User;
var Comment = require('../models/comment').Comment;

router.get('/', function (req, res) {
	var offset = req.query.offset || 0;
	var limit = Math.min(req.query.limit, 100) || 20;
	var search = req.query.search || '';

	var criteria = {
		public: true,
		deleted: false
	};

	if (search) {
		search = new RegExp(search, 'gi');
		criteria['game.sgf'] = search;
	}

	// Get the total count of kifu
	Kifu.count(criteria, function (error, count) {
		var kifuList = Kifu
      .where('public').equals(true)
      .where('deleted').equals(false);

		if (search) {
			kifuList = kifuList
				.where('game.sgf').equals(search);
		}

		kifuList
			.sort({ uploaded: -1 })
			.skip(offset)
			.limit(limit)
			.populate('owner')
			.exec(function (error, kifu) {
				if (!error && kifu.length) {
					res.json(200, {
						kifu: kifu,
						total: count
					});
				} else if (error) {
					res.json(500, { message: 'Error loading kifu. ' + error });
				} else {
					res.json(404, { message: 'No kifu found.' });
				}
			});
	});
});

router.delete('/:id', auth.ensureAuthenticated, function (req, res) {
	Kifu
		.findById(req.params.id)
		.populate('user')
		.exec(function (error, kifu) {
			if (!error && kifu) {
				if (!kifu.isOwner(req.user) && !req.user.admin) {
					res.json(550, { message: 'You can\'t delete another user\'s kifu.' });
				} else {
					kifu.deleted = true;
					kifu.save(function (error) {
						if (!error) {
							res.json(200, {
								message: 'Kifu deleted.'
							});
						} else {
							res.json(500, { message: 'Could not delete kifu.' + error });
						}
					});
				}
			} else if (!error) {
				res.json(404, { message: 'Could not find kifu.' });
			} else {
				res.json(403, { messgae: 'Could not delete comment. ' + error });
			}
		});
});

router.get('/:shortid', function (req, res) {
	Kifu
		.findOne({
			shortid: req.params.shortid
		})
		.exec(function (error, kifu) {
			if (!error && kifu) {
				res.json(200, kifu);
			} else if (error) {
				res.json(500, { message: 'Error loading kifu. ' + error });
			} else {
				res.json(404, { message: 'No kifu found for that shortid.' });
			}
		});
});

// TODO: Why does the _API_ need a shortid? That's only for pretty URLs.
// Change to _id
router.get('/:shortid/sgf', function (req, res) {
	Kifu.findOne({
		shortid: req.params.shortid
	}, function (error, kifu) {
		if (!error && kifu) {
			User.findOne({
				_id: kifu.owner
			}, function (error, owner) {
				console.log(kifu, owner);
				var filename = owner.username + '--' +
					kifu.game.info.black.name +
					'-vs-' +
					kifu.game.info.white.name +
					'.sgf';
				res.set({
					'Content-Disposition': 'attachment; filename=' + filename,
					'Content-Type': 'application/x-go-sgf'
				});
				res.send(200, kifu.game.sgf);

			});
		} else if (error) {
			res.json(500, { message: 'Error loading kifu. ' + error });
		} else {
			res.json(404, { message: 'No kifu found for that shortid.' });
		}
	});
});

router.get('/:id/comments/:path?', function (req, res) {
	Kifu.findOne({
		_id: req.params.id
	} ,function (error, kifu) {
		if (!error && kifu) {
			var findOptions = {
				kifu: kifu
			};

			if (req.params.path) {
				//console.log('checking for path', req.params.path);
				findOptions.path = req.params.path;
				//findOptions.path = decodeURIComponent(req.params.path);
			}

			Comment
				.find(findOptions)
				.sort({
					// For a lit of all comments, use reverse chron
					// For path-specific comments, use chron
					date: (findOptions.path) ? 'asc' : 'desc'
				})
				.populate('user', 'username email gravatar')
				.exec(function (error, comments) {
					if (error) {
						res.json(500, { message: 'Error loading comments. ' + error });
					} else {
						if (!comments.length) {
							comments = [];
						}
						res.json(200, comments);
					}
				});
		} else if (error) {
			res.json(500, { message: 'Error loading kifu. ' + error });
		} else {
			res.json(404, { message: 'No kifu found for that id.' });
		}
	});
});

router.post('/upload', auth.ensureAuthenticated, function (req, res) {
	var form = new multiparty.Form();

	form.parse(req, function (error, fields, files) {
		files.file.forEach(function (file) {
			var sgf = fs.readFileSync(file.path, { encoding: 'utf-8' });
			//var game = smartgame.parse(sgf);
			var newKifu = new Kifu();

			newKifu.owner = req.user;
			newKifu.game.sgf = sgf;
			newKifu.save(function (error) {
				if (!error) {
					res.json(201, {
						message: 'Kifu successfully created!',
						_id: newKifu._id,
						shortid: newKifu.shortid
					});
				} else {
					res.json(500, { message: 'Could not create kifu. Error: ' + error });
				}
			});
		});
	});
});

module.exports = router;

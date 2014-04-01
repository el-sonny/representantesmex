/**
 * DiputadoController.js 
 *
 * @description ::
 * @docs        :: http://sailsjs.org/#!documentation/controllers
 */

module.exports = {
	profile : function(req,res){
		Diputado.findOne(req.param('id')).populate('asistencias').exec(function(e,diputado){
			if(e) throw (e);
			return res.view({
				diputado : diputado
			});
		});
	},
	
	find: function(req,res){
		Diputado.find(req.param('id')).populate('asistencias').exec(function(e,diputado){
			if(e) throw (e);
			return res.json(diputado);
		})
	}

};
